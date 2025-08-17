from rest_framework import viewsets, status, permissions
from rest_framework.decorators import (
    action,
    api_view,
    permission_classes,
    authentication_classes,
    parser_classes,
)
from django.utils.decorators import method_decorator
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.http import Http404, StreamingHttpResponse, FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.clickjacking import xframe_options_exempt
import jwt, logging, io, base64
import hashlib
from datetime import datetime
from ..tasks import send_signature_email, send_reminder_email
from django.conf import settings
from ..otp import generate_otp, validate_otp, send_otp
from ..hsm import hsm_sign
from django.conf import settings
from ..models import (Envelope,EnvelopeRecipient,SignatureDocument,PrintQRCode,AuditLog,EnvelopeDocument)
from ..serializers import (
    EnvelopeSerializer,
    EnvelopeListSerializer,
    SigningFieldSerializer,
    SignatureDocumentSerializer,
    PrintQRCodeSerializer,
)
from signature.crypto_utils import sign_pdf_bytes, load_simple_signer
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from django.core.files.base import ContentFile
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from django.db.models import Q
from pyhanko.sign import signers
from pyhanko.sign.signers import PdfSigner, PdfSignatureMetadata
from pyhanko.sign.fields import SigFieldSpec
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.timestamps.requests_client import HTTPTimeStamper
from oscrypto import keys
from pyhanko.sign.validation import ValidationContext

# 1.a. chargez vos racines de confiance
#    - votre propre certificat (selfsign ou Sectigo)
#    - la racine FreeTSA pour valider le token
sectigo_root = keys.parse_certificate(
    open(settings.PDF_SIGNER_DIR / "selfsign_cert.pem", "rb").read()
)
freetsa_root = keys.parse_certificate(
    open(settings.FREETSA_CACERT, "rb").read()
)

# 1.b. créez le contexte de validation
vc = ValidationContext(
    trust_roots=[sectigo_root, freetsa_root],
    allow_fetching=True,    
    revocation_mode="hard-fail"  
)

tsa_client = HTTPTimeStamper(settings.FREETSA_URL)

# Configure logging
logger = logging.getLogger(__name__)




@api_view(['GET'])
@permission_classes([AllowAny])
def guest_envelope_view(request, pk):
    # 1. Charger l'enveloppe ou 404
    envelope = get_object_or_404(Envelope, pk=pk)

    # 2. Récupérer et vérifier le token
    token = (
        request.GET.get('token')
        or request.POST.get('token')
        or request.headers.get('X-Signature-Token', '')
        or request.headers.get('Authorization', '').replace('Bearer ', '')
    )
    if not token or not EnvelopeViewSet()._verify_token(envelope, token):
        return Response({'error': 'Token invalide ou manquant'}, status=status.HTTP_403_FORBIDDEN)

    # 3. Décoder le JWT pour récupérer le destinataire
    try:
        payload      = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        recipient_id = payload.get('recipient_id')
        recipient    = EnvelopeRecipient.objects.get(envelope=envelope, id=recipient_id)
    except (jwt.InvalidTokenError, EnvelopeRecipient.DoesNotExist):
        return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

    # 4. Sérialiser l’enveloppe de base
    data = EnvelopeSerializer(envelope).data

    # 5. Construire la liste des champs signables
    fields = []
    for f in envelope.fields.all():
        fld = SigningFieldSerializer(f).data
        assigned = f.recipient  # SigningField.recipient → EnvelopeRecipient

        # Par défaut, pas signé
        fld['signed'] = False
        fld['signature_data'] = None

        # Si le destinataire a signé, récupérer le dernier SignatureDocument
        if assigned.signed:
            sig_doc = SignatureDocument.objects.filter(
                envelope=envelope,
                recipient=assigned
            ).order_by('-signed_at').first()
            if sig_doc:
                fld['signed'] = True
                fld['signature_data'] = sig_doc.signature_data

        # Seul le destinataire courant peut modifier son champ non signé
        fld['editable'] = (assigned.id == recipient.id and not assigned.signed)

        fields.append(fld)

    # 6. Mettre à jour la réponse
    data.update({
        'fields':              fields,
        'recipient_id':        recipient.id,
        'recipient_full_name': recipient.full_name,
        'document_url':        request.build_absolute_uri(
                                   f'/api/signature/envelopes/{pk}/document/?token={token}'
                               )
    })

    return Response(data)
def _clean_b64(data: str | None) -> str | None:
    """
    Accepte 'data:image/...;base64,AAAA' ou déjà 'AAAA', renvoie le base64 pur ou None.
    """
    if not data:
        return None
    if isinstance(data, str) and data.startswith('data:image'):
        return data.split(',', 1)[1]
    return data
class EnvelopeViewSet(viewsets.ModelViewSet):
    serializer_class = EnvelopeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    # ---------- Queryset & pages ----------
    def get_queryset(self):
        user = self.request.user
        status_q = self.request.query_params.get('status')
        recipient_filter = (
            Q(recipients__user=user) |
            (Q(recipients__user__isnull=True) & Q(recipients__email=user.email))
        )

        # 1) Brouillons / annulées (créateur)
        if status_q in ['draft', 'cancelled']:
            return Envelope.objects.filter(
                created_by=user, status=status_q
            ).order_by('-created_at')

        # 2) Envoyées = sent OU pending (créateur)
        if status_q == 'sent':
            return Envelope.objects.filter(
                created_by=user, status__in=['sent', 'pending']
            ).order_by('-created_at')

        # 3) Action requise (destinataire non encore signé)
        if status_q == 'action_required':
            return (Envelope.objects
                    .filter(status__in=['sent', 'pending'])
                    .filter(recipient_filter & Q(recipients__signed=False))
                    ).distinct().order_by('-created_at')

        # 4) Complétées : créateur + destinataires ayant signé
        if status_q == 'completed':
            return (Envelope.objects.filter(status='completed')
                    .filter(Q(created_by=user) |
                            (recipient_filter & Q(recipients__signed=True)))
                    ).distinct().order_by('-created_at')

        # 5) Page “Documents” (tout : créateur + destinataires)
        return (Envelope.objects
                .filter(Q(created_by=user) | recipient_filter)
                ).distinct().order_by('-created_at')

    @action(detail=True, methods=['get'], url_path='sign-page', permission_classes=[IsAuthenticated])
    def sign_page(self, request, pk=None):
        """
        Page de signature pour un utilisateur authentifié (sans OTP/token invité).
        Renvoie l’enveloppe + champs signables + infos destinataire.
        """
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)
        try:
            rec = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Vous n’êtes pas destinataire'}, status=403)

        data = EnvelopeSerializer(envelope).data
        fields = []
        for f in envelope.fields.all():
            fld = SigningFieldSerializer(f).data
            assigned = f.recipient
            fld['signed'] = assigned.signed
            fld['signature_data'] = (
                SignatureDocument.objects
                .filter(envelope=envelope, recipient=assigned)
                .order_by('-signed_at').first().signature_data
                if assigned.signed else None
            )
            fld['editable'] = (assigned.user_id == request.user.id and not assigned.signed)
            fields.append(fld)

        data.update({
            'fields': fields,
            'recipient_id': rec.id,
            'recipient_full_name': rec.full_name,
            # côté front, utilisez l’endpoint download/document fournis ci-dessous
        })
        return Response(data)

    @transaction.atomic
    def perform_create(self, serializer):
        envelope = serializer.save(created_by=self.request.user, status='draft')
        envelope.save()

    # ---------- Envoi / Annulation ----------
    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != 'draft':
            return Response({'error': 'Seuls les brouillons peuvent être envoyés'}, status=400)
        if not envelope.recipients.exists():
            return Response({'error': 'Aucun destinataire configuré'}, status=400)

        if not envelope.deadline_at:
            envelope.deadline_at = timezone.now() + timezone.timedelta(days=7)
        envelope.status = 'sent'
        envelope.save()

        # Planification des rappels
        if envelope.flow_type == 'sequential':
            first = envelope.recipients.order_by('order').first()
            if first:
                first.next_reminder_at = timezone.now() + timezone.timedelta(days=envelope.reminder_days)
                first.reminder_count = 0
                first.save(update_fields=['next_reminder_at', 'reminder_count'])
                send_signature_email.delay(envelope.id, first.id)
        else:
            for rec in envelope.recipients.filter(signed=False):
                rec.next_reminder_at = timezone.now() + timezone.timedelta(days=envelope.reminder_days)
                rec.reminder_count = 0
                rec.save(update_fields=['next_reminder_at', 'reminder_count'])
                send_signature_email.delay(envelope.id, rec.id)

        return Response({'status': 'sent', 'message': 'Document envoyé avec succès'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status in ['completed', 'cancelled']:
            return Response({'error': 'Document déjà finalisé'}, status=status.HTTP_400_BAD_REQUEST)
        envelope.status = 'cancelled'
        envelope.save()
        return Response({'status': 'cancelled', 'message': 'Document annulé'})

    # ---------- OTP (invités) ----------
    @action(detail=True, methods=['post'], url_path='send_otp', permission_classes=[permissions.AllowAny])
    def send_otp(self, request, pk=None):
        token = (request.data.get('token') or request.GET.get('token')
                 or request.headers.get('X-Signature-Token', '')
                 or request.headers.get('Authorization', '').replace('Bearer ', ''))
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)

        try:
            envelope = Envelope.objects.get(pk=pk)
            if not self._verify_token(envelope, token):
                return Response({'error': 'Token invalide'}, status=status.HTTP_403_FORBIDDEN)
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            recipient = EnvelopeRecipient.objects.get(envelope=pk, id=payload.get('recipient_id'))
        except (Envelope.DoesNotExist, jwt.InvalidTokenError, EnvelopeRecipient.DoesNotExist):
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

        if envelope.flow_type == 'sequential':
            prev = envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, status=status.HTTP_400_BAD_REQUEST)

        otp = generate_otp(recipient)
        send_otp(recipient, otp)
        if recipient.user:
            recipient.in_app_notified = True
            recipient.notified_at = timezone.now()
            recipient.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='verify_otp', permission_classes=[permissions.AllowAny])
    def verify_otp(self, request, pk=None):
        token = (request.data.get('token') or request.GET.get('token')
                 or request.headers.get('X-Signature-Token', '')
                 or request.headers.get('Authorization', '').replace('Bearer ', ''))
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)

        try:
            envelope = Envelope.objects.get(pk=pk)
            if not self._verify_token(envelope, token):
                return Response({'error': 'Token invalide'}, status=status.HTTP_403_FORBIDDEN)
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            recipient = EnvelopeRecipient.objects.get(envelope=pk, id=payload.get('recipient_id'))
        except (Envelope.DoesNotExist, jwt.InvalidTokenError, EnvelopeRecipient.DoesNotExist):
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)
        if envelope.flow_type == 'sequential':
            prev = envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, status=status.HTTP_400_BAD_REQUEST)

        otp = request.data.get('otp')
        if not otp:
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)
        is_valid, blocked = validate_otp(recipient, otp)
        if blocked:
            return Response({'error': 'Trop de tentatives, OTP verrouillé'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if not is_valid:
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'status': 'otp_verified'}, status=status.HTTP_200_OK)



    @action(detail=True, methods=['post'], url_path='sign_authenticated')
    def sign_authenticated(self, request, pk=None):
        """
        Signature par un utilisateur authentifié.
        """
        envelope = self.get_object()
    
        # récupérer les données envoyées par le front
        signature_data = request.data.get('signature_data')
        signed_fields = request.data.get('signed_fields') or {}
    
        # trouver le destinataire correspondant à l'utilisateur connecté
        try:
            recipient = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({"detail": "Aucun destinataire correspondant."}, status=status.HTTP_403_FORBIDDEN)
    
        # exécuter la signature (graphiquement + électroniquement)
        self._do_sign(envelope, recipient, signature_data, signed_fields)
    
        return Response({"detail": "Document signé avec succès."}, status=status.HTTP_200_OK)
    

    @action(detail=True, methods=['post'])
    def hsm_sign(self, request, pk=None):
        """Signature via HSM (PIN requis)."""
        recipient_id = request.data.get('recipient_id')
        if not recipient_id:
            return Response({'error': 'recipient_id requis'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            recipient = EnvelopeRecipient.objects.get(envelope__pk=pk, id=recipient_id)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Destinataire non trouvé'}, status=status.HTTP_404_NOT_FOUND)

        if recipient.envelope.flow_type == 'sequential':
            prev = recipient.envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, status=status.HTTP_400_BAD_REQUEST)

        pin = request.data.get('pin')
        try:
            signature = hsm_sign(recipient, pin)
            return self._do_sign(recipient.envelope, recipient, signature, request.data.get('signed_fields', {}))

        except Exception as e:
            return Response({'error': f'Erreur HSM : {e}'}, status=status.HTTP_400_BAD_REQUEST)

    # ---------- Téléchargement / Visualisation ----------
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Renvoie une URL de téléchargement :
        - s’il existe déjà un PDF signé (même en 'pending'), on propose l’URL du signé,
        - sinon, l’URL de l’original.
        """
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        is_owner = (envelope.created_by == request.user)
        is_signed_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_signed_recipient):
            return Response({'error': 'Non autorisé'}, status=403)

        sig_doc = (SignatureDocument.objects
                   .filter(envelope=envelope, signed_file__isnull=False)
                   .order_by('-signed_at').first())

        if sig_doc:
            download_url = request.build_absolute_uri(f'/api/signature/envelopes/{pk}/signed-document/')
        else:
            if envelope.document_file or envelope.documents.exists():
                download_url = request.build_absolute_uri(f'/api/signature/envelopes/{pk}/original-document/')
            else:
                return Response({'error': 'Pas de document disponible'}, status=404)

        return Response({'download_url': download_url})

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<doc_id>\d+)/file')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def document_file(self, request, pk=None, doc_id=None):
        """Fournit un PDF original par sous-document (auth requis)."""
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        is_owner = (envelope.created_by == request.user)
        is_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_recipient):
            return Response({'error': 'Non autorisé'}, status=403)

        try:
            doc = envelope.documents.get(pk=doc_id)
        except EnvelopeDocument.DoesNotExist:
            return Response({'error': 'Document introuvable'}, status=404)

        f = doc.file.open('rb')
        f.seek(0)
        if not f.read(10).startswith(b'%PDF-'):
            return Response({'error': 'Document non valide'}, status=400)
        f.seek(0)

        resp = FileResponse(f, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{doc.name or f"document_{doc.id}.pdf"}"'
        resp['X-Frame-Options'] = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp

    @action(detail=True, methods=['get'], url_path='original-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def original_document(self, request, pk=None):
        """Fournit le PDF original (auth requis : créateur ou destinataire)."""
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=status.HTTP_404_NOT_FOUND)

        is_owner = (envelope.created_by == request.user)
        is_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_recipient):
            return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)

        doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
        if not doc:
            return Response({'error': 'Pas de document original'}, status=status.HTTP_404_NOT_FOUND)
        file_obj = doc.open('rb')
        file_obj.seek(0)
        if not file_obj.read(10).startswith(b'%PDF-'):
            return Response({'error': 'Document non valide'}, status=status.HTTP_400_BAD_REQUEST)
        file_obj.seek(0)

        resp = FileResponse(file_obj, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{envelope.title}.pdf"'
        resp['X-Frame-Options']   = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp

    @action(detail=True, methods=['get'], url_path='signed-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def signed_document(self, request, pk=None):
        """Fournit le DERNIER PDF signé (auth requis : créateur ou destinataire)."""
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=status.HTTP_404_NOT_FOUND)

        is_owner = (envelope.created_by == request.user)
        is_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_recipient):
            return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)

        sig_doc = SignatureDocument.objects.filter(envelope=envelope).order_by('-signed_at').first()
        if not sig_doc or not sig_doc.signed_file:
            return Response({'error': 'Pas de document signé'}, status=status.HTTP_404_NOT_FOUND)

        file_obj = sig_doc.signed_file.open('rb')
        file_obj.seek(0)
        if not file_obj.read(10).startswith(b'%PDF-'):
            return Response({'error': 'Document signé non valide'}, status=status.HTTP_400_BAD_REQUEST)
        file_obj.seek(0)

        resp = FileResponse(file_obj, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{envelope.title}_signed.pdf"'
        resp['X-Frame-Options']   = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp

    @action(detail=True, methods=['get'], url_path='document', permission_classes=[permissions.AllowAny])
    @method_decorator(xframe_options_exempt, name='dispatch')
    def document(self, request, pk=None):
        """
        Sert un PDF lisible par les invités **ou** les utilisateurs connectés :
        - si un PDF signé existe → on sert le DERNIER signé,
        - sinon → on sert l’original.
        Autorisation :
          - utilisateur connecté = créateur ou destinataire
          - OU invité avec token valide (?token=...)
        """
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        # Auth: owner/recipient connecté, OU token invité valide
        is_owner = (request.user.is_authenticated and envelope.created_by == request.user)
        is_recipient = (request.user.is_authenticated and envelope.recipients.filter(user=request.user).exists())
        token = (request.GET.get('token') or request.headers.get('X-Signature-Token', '')
                 or request.headers.get('Authorization', '').replace('Bearer ', ''))
        token_ok = bool(token and self._verify_token(envelope, token))

        if not (is_owner or is_recipient or token_ok):
            return Response({'error': 'Non autorisé'}, status=403)

        # Choix du fichier à servir
        sig = (SignatureDocument.objects
               .filter(envelope=envelope, signed_file__isnull=False)
               .order_by('-signed_at').first())
        if sig:
            file_field = sig.signed_file
            filename_suffix = 'signed'
        else:
            doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
            if not doc:
                return Response({'error': 'Pas de document disponible'}, status=404)
            file_field = doc
            filename_suffix = 'original'

        try:
            fh = file_field.storage.open(file_field.name, 'rb')
            resp = FileResponse(fh, content_type='application/pdf')
            resp['Content-Disposition'] = f'inline; filename="{envelope.title}_{filename_suffix}.pdf"'
            resp['X-Frame-Options'] = 'ALLOWALL'
            resp['Content-Security-Policy'] = "frame-ancestors *"
            resp['Access-Control-Allow-Origin'] = '*'
            return resp
        except Exception as e:
            return Response({'error': f'Échec d’ouverture du fichier : {e}'}, status=500)

    # ---------- Cœur : signature incrémentale sans aplatir ----------
    def _add_signature_overlay_to_pdf(self, pdf_bytes, signature_data, x, y_top, w, h, page_ix):
        """
        NOUVELLE MÉTHODE: Ajoute un overlay graphique sur un PDF existant
        sans perdre les signatures précédentes.
        """
        import io, base64
        from PyPDF2 import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
    
        # 1) Lire le PDF de base
        base_reader = PdfReader(io.BytesIO(pdf_bytes))
        
        # 2) Obtenir les dimensions de la page cible
        if page_ix >= len(base_reader.pages):
            page_ix = 0
        page = base_reader.pages[page_ix]
        page_w = float(page.mediabox.width)
        page_h = float(page.mediabox.height)
        
        # 3) Convertir les coordonnées
        y_pdf = page_h - (y_top + h)
        
        # 4) Extraire l'image de signature
        img_data = None
        if isinstance(signature_data, dict):
            for key, value in signature_data.items():
                if isinstance(value, str) and value:
                    img_data = value
                    break
        elif isinstance(signature_data, str):
            img_data = signature_data
    
        # 5) Créer l'overlay avec ReportLab
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(page_w, page_h))
        
        try:
            if img_data and isinstance(img_data, str):
                # Gérer les data URLs
                b64_data = img_data.split(',', 1)[1] if img_data.startswith('data:') else img_data
                if b64_data:
                    img_bytes = base64.b64decode(b64_data)
                    c.drawImage(
                        ImageReader(io.BytesIO(img_bytes)),
                        x, y_pdf, width=w, height=h,
                        preserveAspectRatio=True, mask='auto'
                    )
        except Exception as e:
            # En cas d'erreur avec l'image, on continue sans bloquer
            logger.warning(f"Erreur lors de l'ajout de l'overlay graphique: {e}")
        
        c.showPage()
        c.save()
        packet.seek(0)
    
        # 6) Fusionner l'overlay avec le PDF existant
        try:
            overlay_reader = PdfReader(packet)
            writer = PdfWriter()
            
            for i, base_page in enumerate(base_reader.pages):
                if i == page_ix and len(overlay_reader.pages) > 0:
                    # Fusionner l'overlay sur la page cible
                    base_page.merge_page(overlay_reader.pages[0])
                writer.add_page(base_page)
            
            # Écrire le résultat
            output = io.BytesIO()
            writer.write(output)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Erreur lors de la fusion de l'overlay: {e}")
            # En cas d'échec, retourner le PDF original
            return pdf_bytes
    
    # ---------- Signature ----------
    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
# Dans envelope.py - Méthode sign corrigée

    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def sign(self, request, pk=None):
        """Signature pour invité via token."""
        token = (request.data.get('token') or request.GET.get('token')
                 or request.headers.get('X-Signature-Token', '')
                 or request.headers.get('Authorization', '').replace('Bearer ', ''))
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)
        try:
            envelope = Envelope.objects.get(pk=pk)
            if not self._verify_token(envelope, token):
                return Response({'error': 'Token invalide'}, status=status.HTTP_403_FORBIDDEN)
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            recipient = EnvelopeRecipient.objects.get(envelope=pk, id=payload.get('recipient_id'))
        except (Envelope.DoesNotExist, jwt.InvalidTokenError, EnvelopeRecipient.DoesNotExist):
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)
    
        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)
        if envelope.flow_type == 'sequential':
            prev = envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, status=status.HTTP_400_BAD_REQUEST)
    
        signature_data = request.data.get('signature_data')
        signed_fields   = request.data.get('signed_fields')
        if not signature_data or not signed_fields:
            return Response({'error': 'signature_data et signed_fields requis'}, status=status.HTTP_400_BAD_REQUEST)
    
        
        my_fields_meta = []
        for f in envelope.fields.all():
            meta = SigningFieldSerializer(f).data
            rid = str(meta.get('recipient_id') or meta.get('assigned_recipient_id') or "")
            if rid and rid == str(recipient.id):
                my_fields_meta.append(meta)
        
        
        if not my_fields_meta:
            my_fields_meta = list((signed_fields or {}).values())
        
        if not my_fields_meta:
            raise ValueError("Aucun champ de signature valide pour ce destinataire")
        
        
        latest = (
            SignatureDocument.objects
            .filter(envelope=envelope, signed_file__isnull=False)
            .order_by('-signed_at')
            .first()
        )
        
        if latest and latest.signed_file:
            with latest.signed_file.open('rb') as bf:
                base_bytes = bf.read()
        else:
            doc = envelope.document_file or (
                envelope.documents.first().file if envelope.documents.exists() else None
            )
            if not doc:
                raise ValueError("Pas de document original")
            with doc.open('rb') as f:
                base_bytes = f.read()
    
        
        with transaction.atomic():
            recipient.signed = True
            recipient.signed_at = timezone.now()
            recipient.save(update_fields=['signed', 'signed_at'])
            
            sig_doc = SignatureDocument.objects.create(
                envelope=envelope,
                recipient=recipient,
                signer=(self.request.user if self.request and self.request.user.is_authenticated else None),
                is_guest=(recipient.user is None),
                signature_data=json.dumps(signature_data) if isinstance(signature_data, dict) else (signature_data or ""),
                signed_fields=signed_fields,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            )
            
            
            for fmeta in my_fields_meta:
                pos = fmeta.get('position') or {}
                try:
                    x = float(pos.get('x', 0)); y_top = float(pos.get('y', 0))
                    w = float(pos.get('width', 0)); h = float(pos.get('height', 0))
                except Exception:
                    x, y_top, w, h = 0, 0, 180, 60
                page_num = int(fmeta.get('page') or 1)
                page_ix = max(0, page_num - 1)
                
                
                reader = PdfReader(io.BytesIO(base_bytes))
                page_h = float(reader.pages[page_ix].mediabox.height)
                y_pdf = page_h - (y_top + h)
                rect_widget = (x, y_pdf, x + w, y_pdf + h)
                
                field_id = str(fmeta.get('id') or fmeta.get('field_id') or '')
                img_for_this_field = None
                if isinstance(signature_data, dict):
                    candidates = [
                        signature_data.get(field_id),
                        signature_data.get(int(field_id)) if field_id.isdigit() else None,
                        signature_data.get('data_url'),
                    ]
                    img_for_this_field = next((v for v in candidates if isinstance(v, str) and v), None)
                elif isinstance(signature_data, str):
                    img_for_this_field = signature_data
                
                
                img_for_this_field = _clean_b64(img_for_this_field)
                
                
                signed_bytes = sign_pdf_bytes(
                    base_bytes,
                    field_name=f"Sig_{recipient.id}_{field_id}",  
                    reason="Signature numérique",
                    location="Plateforme",
                    rect=rect_widget,
                    page_ix=page_ix,
                    appearance_image_b64=img_for_this_field  
                )
                base_bytes = signed_bytes  
            
            
            file_name = f"signed_{envelope.id}_{recipient.id}.pdf"
            sig_doc.signed_file.save(file_name, ContentFile(base_bytes), save=True)
        
            # Statut enveloppe
            if envelope.recipients.filter(signed=False).exists():
                if envelope.status != 'pending':
                    envelope.status = 'pending'
                    envelope.save(update_fields=['status'])
            else:
                envelope.status = 'completed'
                envelope.save(update_fields=['status'])
        
        return Response({'status': 'signed'})
    
    
    # Méthode _do_sign corrigée aussi
    def _do_sign(self, envelope, recipient, signature_data, signed_fields):
        import io, uuid
        from PyPDF2 import PdfReader
        from django.core.files.base import ContentFile
    
        # 1) Trouver TOUS les champs de CE destinataire
        my_fields_meta = []
        for _, meta in (signed_fields or {}).items():
            if not meta:
                continue
            rid = str(meta.get('recipient_id') or meta.get('assigned_recipient_id') or "")
            if rid and rid == str(recipient.id):
                my_fields_meta.append(meta)
        
        # fallback si rien trouvé
        if not my_fields_meta:
            for _, meta in (signed_fields or {}).items():
                if meta:
                    my_fields_meta.append(meta)
                    break
        if not my_fields_meta:
            raise ValueError("Aucun champ de signature valide pour ce destinataire")
    
        logger.info(f"_do_sign: traitement de {len(my_fields_meta)} champs pour le destinataire {recipient.id}")
    
        # 2) Choisir la base PDF : partir du dernier PDF signé s'il existe
        latest = (
            SignatureDocument.objects
            .filter(envelope=envelope, signed_file__isnull=False)
            .order_by('-signed_at')
            .first()
        )
        
        if latest and latest.signed_file:
            with latest.signed_file.open('rb') as bf:
                base_bytes = bf.read()
            logger.info(f"_do_sign: base = dernier PDF signé (SignatureDocument {latest.id})")
        else:
            doc = envelope.document_file or (
                envelope.documents.first().file if envelope.documents.exists() else None
            )
            if not doc:
                raise ValueError("Pas de document original")
            with doc.open('rb') as f:
                base_bytes = f.read()
            logger.info("_do_sign: base = document original")
    
        # 3) ✅ TRAITEMENT CHAMP PAR CHAMP : overlay + signature immédiatement
        for i, fmeta in enumerate(my_fields_meta):
            pos = fmeta.get('position') or {}
            try:
                x = float(pos.get('x', 0)); y_top = float(pos.get('y', 0))
                w = float(pos.get('width', 0)); h = float(pos.get('height', 0))
            except Exception:
                x, y_top, w, h = 0, 0, 180, 60
            page_num = int(fmeta.get('page') or 1)
            page_ix = max(0, page_num - 1)
    
            # Extraire l'image de signature POUR CE CHAMP
            field_id = str(fmeta.get('id') or fmeta.get('field_id') or '')
            img_for_this_field = None
            if isinstance(signature_data, dict):
                candidates = [
                    signature_data.get(field_id),
                    signature_data.get(int(field_id)) if field_id.isdigit() else None,
                    signature_data.get('data_url'),
                ]
                img_for_this_field = next((v for v in candidates if isinstance(v, str) and v), None)
            elif isinstance(signature_data, str):
                img_for_this_field = signature_data
    
            img_for_this_field = _clean_b64(img_for_this_field)
    
            # ✅ ÉTAPE A : Ajouter l'overlay graphique POUR CE CHAMP
            if img_for_this_field:
                logger.info(f"_do_sign: ajout overlay graphique pour champ {field_id}")
                base_bytes = self._add_signature_overlay_to_pdf(
                    base_bytes, img_for_this_field, x, y_top, w, h, page_ix
                )
    
            # ✅ ÉTAPE B : Ajouter IMMÉDIATEMENT la signature numérique POUR CE CHAMP
            reader = PdfReader(io.BytesIO(base_bytes))
            page_h = float(reader.pages[page_ix].mediabox.height)
            y_pdf = page_h - (y_top + h)
            
            # ⚠️ IMPORTANT : Coordonnées légèrement décalées pour éviter les conflits
            rect_crypto = (x + 1, y_pdf + 1, x + w - 1, y_pdf + h - 1)
    
            # Nom de champ ULTRA-unique avec microseconde et index
            signature_timestamp = timezone.now().strftime("%Y%m%d_%H%M%S_%f")
            unique_suffix = str(uuid.uuid4())[:8]
            unique_field_name = f"Sig_{recipient.id}_{field_id}_{i}_{signature_timestamp}_{unique_suffix}"
    
            logger.info(f"_do_sign: ajout signature numérique {unique_field_name} pour champ {field_id}")
            
            # Signature numérique SANS apparence (car on a déjà l'overlay)
            base_bytes = sign_pdf_bytes(
                base_bytes,
                field_name=unique_field_name,
                reason=f"Signature numérique - {recipient.full_name}",
                location="Plateforme IntelliVibe",
                rect=rect_crypto,
                page_ix=page_ix,
                # ❌ NE PAS passer appearance_image_b64
            )
            
            logger.info(f"_do_sign: champ {i+1}/{len(my_fields_meta)} traité avec succès")
    
        # 4) Sauvegarder le résultat
        with transaction.atomic():
            recipient.signed = True
            recipient.signed_at = timezone.now()
            recipient.save(update_fields=['signed', 'signed_at'])
        
            sig_doc = SignatureDocument.objects.create(
                envelope=envelope,
                recipient=recipient,
                signer=(self.request.user if self.request and self.request.user.is_authenticated else None),
                is_guest=(recipient.user is None),
                signature_data=signature_data,
                signed_fields=signed_fields,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            )
        
            signature_timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            file_name = f"signed_{envelope.id}_{recipient.id}_{signature_timestamp}.pdf"
            sig_doc.signed_file.save(file_name, ContentFile(base_bytes), save=True)
    
            logger.info(f"_do_sign: PDF final sauvegardé : {file_name}")
    
            # Statut enveloppe
            if envelope.recipients.filter(signed=False).exists():
                if envelope.status != 'pending':
                    envelope.status = 'pending'
                    envelope.save(update_fields=['status'])
            else:
                envelope.status = 'completed'
                envelope.save(update_fields=['status'])
    
        return Response({'status': 'signed'})   
    def _add_signature_overlay_to_pdf(self, pdf_bytes, signature_data, x, y_top, w, h, page_ix):
        """
        Version améliorée qui préserve TOUJOURS les signatures existantes
        """
        import io, base64
        from PyPDF2 import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
    
        try:
            logger.info(f"_add_signature_overlay_to_pdf: overlay à ({x}, {y_top}, {w}, {h}) sur page {page_ix}")
            
            # 1) Lire le PDF de base (qui peut déjà contenir des signatures)
            base_reader = PdfReader(io.BytesIO(pdf_bytes))
            
            # 2) Obtenir les dimensions de la page cible
            if page_ix >= len(base_reader.pages):
                logger.warning(f"Page {page_ix} n'existe pas, utilisation de la page 0")
                page_ix = 0
            page = base_reader.pages[page_ix]
            page_w = float(page.mediabox.width)
            page_h = float(page.mediabox.height)
            
            # 3) Convertir les coordonnées (front-end -> PDF)
            y_pdf = page_h - (y_top + h)
            
            # 4) Extraire et valider l'image de signature
            img_data = signature_data
            if isinstance(signature_data, dict):
                for key, value in signature_data.items():
                    if isinstance(value, str) and value:
                        img_data = value
                        break
        
            if not img_data or not isinstance(img_data, str):
                logger.warning("Pas d'image de signature trouvée, overlay ignoré")
                return pdf_bytes
        
            # 5) Créer l'overlay avec ReportLab
            packet = io.BytesIO()
            c = canvas.Canvas(packet, pagesize=(page_w, page_h))
            
            try:
                # Gérer les data URLs
                b64_data = img_data.split(',', 1)[1] if img_data.startswith('data:') else img_data
                if b64_data:
                    img_bytes = base64.b64decode(b64_data)
                    c.drawImage(
                        ImageReader(io.BytesIO(img_bytes)),
                        x, y_pdf, width=w, height=h,
                        preserveAspectRatio=True, mask='auto'
                    )
                    logger.info(f"Image de signature ajoutée avec succès à ({x}, {y_pdf})")
            except Exception as e:
                logger.warning(f"Erreur lors du traitement de l'image de signature: {e}")
                # Continuer sans l'image plutôt que d'échouer
            
            c.showPage()
            c.save()
            packet.seek(0)
    
            # 6) Fusionner l'overlay avec TOUTES les pages existantes (préserve les signatures)
            overlay_reader = PdfReader(packet)
            writer = PdfWriter()
            
            for i, base_page in enumerate(base_reader.pages):
                if i == page_ix and len(overlay_reader.pages) > 0:
                    # Fusionner l'overlay UNIQUEMENT sur la page cible
                    try:
                        base_page.merge_page(overlay_reader.pages[0])
                        logger.info(f"Overlay fusionné sur page {i}")
                    except Exception as e:
                        logger.warning(f"Erreur lors de la fusion de l'overlay sur la page {i}: {e}")
                writer.add_page(base_page)
            
            # 7) Écrire le résultat
            output = io.BytesIO()
            writer.write(output)
            result = output.getvalue()
            
            logger.info(f"Overlay ajouté avec succès, taille finale: {len(result)} bytes")
            return result
            
        except Exception as e:
            logger.error(f"Erreur critique lors de l'ajout de l'overlay graphique: {e}")
            # En cas d'échec, retourner le PDF original pour ne pas bloquer le processus
            return pdf_bytes
    def _refuse_if_deadline_passed(self, envelope):
        if envelope.deadline_at and timezone.now() >= envelope.deadline_at:
            if envelope.status in ['sent', 'pending']:
                envelope.status = 'expired'
                envelope.save(update_fields=['status'])
            return True
        return False

    def _verify_token(self, envelope, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            return payload.get('env_id') == envelope.id and 'recipient_id' in payload
        except jwt.InvalidTokenError:
            return False

def _verify_token(self, envelope, token):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            return payload.get('env_id') == envelope.id and 'recipient_id' in payload
        except jwt.InvalidTokenError:
            return False
@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
@xframe_options_exempt
def serve_decrypted_pdf(request, pk):
    """
    Sert le document PDF déchiffré :
    - si l'enveloppe est 'completed', on sert le dernier signed_file
    - sinon, on sert le document original
    """
    # 1. Charger l'enveloppe
    try:
        envelope = Envelope.objects.get(pk=pk)
    except Envelope.DoesNotExist:
        return Response({'error': 'Enveloppe non trouvée'}, status=404)

    # 2. Choix du fichier à servir
    if envelope.status == 'completed':
        # récupérer le dernier document signé
        sig = (
            SignatureDocument.objects
            .filter(envelope=envelope)
            .order_by('-signed_at')
            .first()
        )
        if not sig or not sig.signed_file:
            return Response({'error': 'Pas de document signé'}, status=404)
        file_field = sig.signed_file
        filename_suffix = 'signed'
    else:
        # document original
        doc = envelope.document_file or (
            envelope.documents.first().file if envelope.documents.exists() else None
        )
        if not doc:
            return Response({'error': 'Pas de document original'}, status=404)
        file_field = doc
        filename_suffix = 'original'

    # 3. Ouvrir via storage.open() pour déchiffrement et renvoyer la réponse
    try:
        file_handle = file_field.storage.open(file_field.name, 'rb')
        response = FileResponse(file_handle, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="{envelope.title}_{filename_suffix}.pdf"'
        )
        # Autoriser l’iframe depuis n’importe quelle origine
        response['X-Frame-Options'] = 'ALLOWALL'
        response['Content-Security-Policy'] = "frame-ancestors *"
        response['Access-Control-Allow-Origin'] = '*'
        return response
    except Exception as e:
        return Response({'error': f'Échec d’ouverture du fichier : {e}'}, status=500)

class PrintQRCodeViewSet(viewsets.ModelViewSet):
    serializer_class = PrintQRCodeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PrintQRCode.objects.filter(envelope__created_by=self.request.user)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        envelope_id = request.data.get('envelope')
        qr_type = request.data.get('qr_type', 'dynamic')
        
        try:
            envelope = Envelope.objects.get(id=envelope_id, created_by=request.user)
        except Envelope.DoesNotExist:
            logger.error(f"Document {envelope_id} non trouvé pour génération de QR code")
            return Response({'error': 'Document non trouvé'}, 
                            status=status.HTTP_404_NOT_FOUND)
        
        qr = PrintQRCode.objects.create(
            envelope=envelope,
            qr_type=qr_type
        )
        
        serializer = self.get_serializer(qr)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def verify(self, request, pk=None):
        try:
            qr = self.get_object()
        except Http404:
            logger.error(f"QR Code {pk} non trouvé")
            return Response({'error': 'QR Code non trouvé'}, 
                            status=status.HTTP_404_NOT_FOUND)
        
        if not qr.is_valid:
            logger.error(f"QR Code {pk} invalide ou expiré")
            return Response({'error': 'QR Code invalide ou expiré'}, 
                            status=status.HTTP_403_FORBIDDEN)
        
        if qr.qr_type == 'dynamic':
            qr.state = 'scanned'
            qr.scanned_at = timezone.now()
            qr.save()
        
        return Response({
            'envelope_id': qr.envelope.id,
            'title': qr.envelope.title,
            'file_url': qr.envelope.document_file.url,
            'token': qr.envelope.jwt_token
        })

class SignatureDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SignatureDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SignatureDocument.objects.filter(
            envelope__created_by=self.request.user
        ).order_by('-signed_at')