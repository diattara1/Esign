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
from ..tasks import send_signature_email
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

class EnvelopeViewSet(viewsets.ModelViewSet):
    serializer_class = EnvelopeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        status = self.request.query_params.get('status')
        recipient_filter = (
            Q(recipients__user=user) |
            (Q(recipients__user__isnull=True) & Q(recipients__email=user.email))
        )

        # 1) Brouillons, envoyées, supprimées : seuls le créateur
        if status in ['draft', 'sent', 'cancelled']:
            return Envelope.objects.filter(
                created_by=user,
                status=status
            ).order_by('-created_at')
        # 2) Actions requises : destinataire non encore signé
        if status == 'action_required':
            return Envelope.objects.filter(
                status='sent',  # on ne propose qu’aux enveloppes envoyées
            ).filter(
                recipient_filter & Q(recipients__signed=False)
            ).distinct().order_by('-created_at')
        # 3) Complétées : créateur + destinataires ayant signé
        if status == 'completed':
            return Envelope.objects.filter(
                status='completed'
            ).filter(
                Q(created_by=user) |
                (recipient_filter & Q(recipients__signed=True))
            ).distinct().order_by('-created_at')
        # 4) Page “Documents” (pas de filtre de statut) → créateur et destinataires
        return Envelope.objects.filter(
            Q(created_by=user) | recipient_filter
        ).distinct().order_by('-created_at')
        
    @action(detail=True, methods=['get'], url_path='sign-page', permission_classes=[IsAuthenticated])
    def sign_page(self, request, pk=None):
        """
        Récupère pour le destinataire connecté :
         - les infos d'enveloppe
         - la liste des champs à signer (avec editable=False/True)
         - l'URL de téléchargement déchiffré (via downloadEnvelope)
        """
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)
        try:
            rec = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Vous n’êtes pas destinataire'}, status=403)

        # Construire la réponse exactement comme pour guest_envelope_view,
        # mais sans token ni OTP
        data = EnvelopeSerializer(envelope).data

        # champs signables
        fields = []
        for f in envelope.fields.all():
            fld = SigningFieldSerializer(f).data
            assigned = f.recipient
            fld['signed'] = assigned.signed
            fld['signature_data'] = (
                SignatureDocument.objects
                  .filter(envelope=envelope, recipient=assigned)
                  .order_by('-signed_at')
                  .first()
                  .signature_data
                if assigned.signed else None
            )
            fld['editable'] = (assigned.user_id == request.user.id and not assigned.signed)
            fields.append(fld)

        data.update({
            'fields':       fields,
            'recipient_id': rec.id,
            'recipient_full_name': rec.full_name,
            # on chargera le PDF via signatureService.downloadEnvelope()
        })
        return Response(data)

    @transaction.atomic
    def perform_create(self, serializer):
        envelope = serializer.save(created_by=self.request.user, status='draft')
        envelope.save()

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status != 'draft':
            return Response({'error': 'Seuls les brouillons peuvent être envoyés'}, status=status.HTTP_400_BAD_REQUEST)
        if not envelope.recipients.exists():
            return Response({'error': 'Aucun destinataire configuré'}, status=status.HTTP_400_BAD_REQUEST)

        envelope.status = 'sent'
        if not envelope.deadline_at:
            envelope.deadline_at = timezone.now() + timezone.timedelta(days=7)
        envelope.save()
        if envelope.flow_type == 'sequential':
            first = envelope.recipients.order_by('order').first()
            send_signature_email.delay(envelope.id, first.id)
            if first.user:  # Notify in-app if user has an account
                first.in_app_notified = True
                first.notified_at = timezone.now()
                first.save()
        else:
            # en parallèle, on prévient tous les destinataires
            for rec in envelope.recipients.all():
                send_signature_email.delay(envelope.id, rec.id)
                if rec.user:  # Notify in-app if user has an account
                    rec.in_app_notified = True
                    rec.notified_at = timezone.now()
                    rec.save()

        return Response({'status': 'sent', 'message': 'Document envoyé avec succès'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        envelope = self.get_object()
        if envelope.status in ['completed', 'cancelled']:
            return Response({'error': 'Document déjà finalisé'}, status=status.HTTP_400_BAD_REQUEST)
        envelope.status = 'cancelled'
        envelope.save()
        return Response({'status': 'cancelled', 'message': 'Document annulé'})

    @action(detail=True, methods=['post'], url_path='send_otp', permission_classes=[permissions.AllowAny])
    def send_otp(self, request, pk=None):
        token = (
            request.data.get('token')
            or request.GET.get('token')
            or request.headers.get('X-Signature-Token', '')
            or request.headers.get('Authorization', '').replace('Bearer ', '')
        )
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
        if recipient.user:  # Notify in-app if user has an account
            recipient.in_app_notified = True
            recipient.notified_at = timezone.now()
            recipient.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='verify_otp', permission_classes=[permissions.AllowAny])
    def verify_otp(self, request, pk=None):
        token = (
            request.data.get('token')
            or request.GET.get('token')
            or request.headers.get('X-Signature-Token', '')
            or request.headers.get('Authorization', '').replace('Bearer ', '')
        )
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

        otp = request.data.get('otp')
        if not otp:
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)
        is_valid, blocked = validate_otp(recipient, otp)
        if blocked:
            return Response({'error': 'Trop de tentatives, OTP verrouillé'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if not is_valid:
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'status': 'otp_verified'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='sign', permission_classes=[permissions.AllowAny])
    def sign(self, request, pk=None):
        token = (
            request.data.get('token')
            or request.GET.get('token')
            or request.headers.get('X-Signature-Token', '')
            or request.headers.get('Authorization', '').replace('Bearer ', '')
        )
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

        signature_data = request.data.get('signature_data')
        signed_fields   = request.data.get('signed_fields')
        if not signature_data or not signed_fields:
            return Response({'error': 'signature_data et signed_fields requis'}, status=status.HTTP_400_BAD_REQUEST)

        return self._do_sign(recipient, signature_data, signed_fields)

    @action(detail=True, methods=['post'])
    def hsm_sign(self, request, pk=None):
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
            return self._do_sign(recipient, signature, request.data.get('signed_fields', {}))
        except Exception as e:
            return Response({'error': f'Erreur HSM : {e}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='sign_authenticated')
    def sign_authenticated(self, request, pk=None):
        """
        Signing endpoint for authenticated users (no token required)
        """
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=status.HTTP_404_NOT_FOUND)
        
        # Get the recipient for the authenticated user
        try:
            recipient = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Vous n\'êtes pas destinataire de cette enveloppe'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        # Check sequential flow
        if envelope.flow_type == 'sequential':
            prev = envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Check if already signed
        if recipient.signed:
            return Response({'error': 'Vous avez déjà signé ce document'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required data
        signature_data = request.data.get('signature_data')
        signed_fields = request.data.get('signed_fields')
        if not signature_data or not signed_fields:
            return Response({'error': 'signature_data et signed_fields requis'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        return self._do_sign(recipient, signature_data, signed_fields)
    
    @action(detail=True, methods=['get'], url_path=r'documents/(?P<doc_id>\d+)/file')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def document_file(self, request, pk=None, doc_id=None):
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)
    
        # autorisations : créateur ou destinataire de l'enveloppe
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
        head = f.read(10)
        f.seek(0)
        if not head.startswith(b'%PDF-'):
            return Response({'error': 'Document non valide'}, status=400)
    
        resp = FileResponse(f, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{doc.name or f"document_{doc.id}.pdf"}"'
        resp['X-Frame-Options'] = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp
    @action(detail=True, methods=['get'], url_path='original-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def original_document(self, request, pk=None):
        # Get the envelope directly without queryset filtering
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=status.HTTP_404_NOT_FOUND)
        
        is_owner = (envelope.created_by == request.user)
        is_recipient = envelope.recipients.filter(user=request.user).exists()
        
        if not (is_owner or is_recipient):
            return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)
    
        doc = envelope.document_file or (
            envelope.documents.first().file if envelope.documents.exists() else None
        )
        if not doc:
            return Response({'error': 'Pas de document original'}, status=status.HTTP_404_NOT_FOUND)
        file_obj = doc.open('rb')
        file_obj.seek(0)
        if not file_obj.read(10).startswith(b'%PDF-'):
            return Response({'error': 'Document non valide'}, status=status.HTTP_400_BAD_REQUEST)
        file_obj.seek(0)
        resp = FileResponse(file_obj, content_type='application/pdf')
        resp['Content-Disposition'] = f'inline; filename="{envelope.title}.pdf"'
        resp['X-Frame-Options'] = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp

    @action(detail=True, methods=['get'], url_path='signed-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def signed_document(self, request, pk=None):
        # Get the envelope directly without queryset filtering
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
        resp['X-Frame-Options'] = 'SAMEORIGIN'
        resp['Content-Security-Policy'] = "frame-ancestors 'self'"
        resp['Access-Control-Allow-Origin'] = request.META.get('HTTP_ORIGIN', '*')
        return resp

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Renvoie l'URL pour récupérer le PDF :
         - si un PDF signé existe déjà (même statut 'pending'), on le sert
         - sinon, on sert le PDF original
        """
        # On récupère l’enveloppe brute, sans filtrage DRF
        try:
            envelope = Envelope.objects.get(pk=pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        # Autorisation : soit le créateur, soit un destinataire qui a signé
        is_owner = (envelope.created_by == request.user)
        is_signed_recipient = envelope.recipients.filter(
            user=request.user
        ).exists()
        if not (is_owner or is_signed_recipient):
            return Response({'error': 'Non autorisé'}, status=403)

        # On cherche le dernier document signé (qu'il soit pending ou completed)
        sig_doc = SignatureDocument.objects.filter(
            envelope=envelope,
            signed_file__isnull=False
        ).order_by('-signed_at').first()

        if sig_doc:
            download_url = request.build_absolute_uri(
                f'/api/signature/envelopes/{pk}/signed-document/'
            )
        else:
            if envelope.document_file or envelope.documents.exists():
                download_url = request.build_absolute_uri(
                    f'/api/signature/envelopes/{pk}/original-document/'
                )
            else:
                return Response({'error': 'Pas de document disponible'}, status=404)

        return Response({'download_url': download_url})

    def _do_sign(self, recipient, signature_data, signed_fields):
        if recipient.signed:
            return Response({'error': 'Destinataire a déjà signé'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Marquer le destinataire signé
        with transaction.atomic():
            recipient.signature_data = signature_data
            recipient.signed = True
            recipient.signed_at = timezone.now()
            recipient.save()

            # 2. Créer l'enregistrement sans fichier
            sig_doc = SignatureDocument.objects.create(
                envelope=recipient.envelope,
                recipient=recipient,
                is_guest=recipient.user is None,
                signature_data=signature_data,
                signed_fields=signed_fields,
                ip_address=self.request.META.get('REMOTE_ADDR'),
                user_agent=self.request.META.get('HTTP_USER_AGENT', '')
            )

            AuditLog.objects.create(
                user=self.request.user if self.request.user.is_authenticated else None,
                envelope=recipient.envelope,
                action='document_signed',
                details={'recipient_id': recipient.id, 'signature_id': sig_doc.id},
                ip_address=self.request.META.get('REMOTE_ADDR'),
                user_agent=self.request.META.get('HTTP_USER_AGENT', ''),
            )

            # 3. Fusionner image+PDF
            merged = self._merge_pdf(recipient.envelope, signature_data, signed_fields)

            # 4. Signer numériquement avec PyHanko (version corrigée)
            merged_bytes = io.BytesIO(merged.read())
            merged_bytes.seek(0)
            
            # Crée un writer pyhanko à partir du PDF fusionné
            pdf_out = IncrementalPdfFileWriter(merged_bytes)
            
            output_buffer = io.BytesIO()
            signer = signers.SimpleSigner.load(
         key_file=settings.PDF_SIGNER_DIR / "selfsign_key.pem",
         cert_file=settings.PDF_SIGNER_DIR / "selfsign_cert.pem",
         ca_chain_files=[settings.PDF_SIGNER_DIR / "selfsign_cert.pem"],
         key_passphrase=None
     )
 
     # 4.b Signer avec l’instance signer
            sig_meta = PdfSignatureMetadata(
    field_name=f"Sig_{recipient.id}",
    reason="Signature numérique",
    location="IntelliVibe",
    embed_validation_info=True,    # collecte OCSP/CRL dans le DSS
    use_pades_lta=True,            # ajoute les VRI pour LTV complet
    validation_context=vc          # le contexte de validation chargé plus haut
)

# 2) Créez le PdfSigner
            pdf_signer = PdfSigner(
    signature_meta=sig_meta,
    signer=signer,
    timestamper=tsa_client,
    new_field_spec=SigFieldSpec(sig_field_name=f"Sig_{recipient.id}")
)

            pdf_signer.sign_pdf(pdf_out, output=output_buffer)
            
            output_buffer.seek(0)

            # 5. Sauver le PDF signé
            sig_doc.signed_file.save(
                f"signed_{recipient.envelope.id}_{recipient.id}.pdf",
                ContentFile(output_buffer.read()),
                save=True
            )

            # 6. Stocker certificate_data
            cert_der = signer.signing_cert[0].dump()
            sig_hash = hashlib.sha256(output_buffer.getvalue()).hexdigest()
            timestamp_utc = datetime.utcnow().isoformat() + "Z"
            sig_doc.certificate_data = {
                "certificate_der": base64.b64encode(cert_der).decode(),
                "signature_sha256": sig_hash,
                "timestamp_utc": timestamp_utc
            }
            sig_doc.save()

            # 7. Mettre à jour le statut de l'enveloppe
            env = recipient.envelope
            env.status = 'pending' if env.recipients.filter(signed=False).exists() else 'completed'
            env.save()

        # 8. Prévenir le suivant si séquentiel
        if env.flow_type == 'sequential' and env.status == 'pending':
            next_rec = env.recipients.filter(signed=False).order_by('order').first()
            send_signature_email.delay(env.id, next_rec.id)
            if next_rec.user:  # Notify in-app if user has an account
                next_rec.in_app_notified = True
                next_rec.notified_at = timezone.now()
                next_rec.save()

        return Response({'status': 'signed', 'message': 'Document signé avec succès'})

    def _merge_pdf(self, envelope, signature_data, signed_fields):
        """
        Construit un PDF avec les nouvelles signatures.
        - S'il existe un signed_file précédent, on repart de ce PDF (pour conserver l'historique)
        - Sinon on reconstruit à partir du document unique ou de la liste EnvelopeDocument
        - Les champs sont positionnés par (document_id, page, position)
        """
        # 0) Normaliser signature_data et signed_fields
        #    signed_fields: dict[field_id] -> {page, position, document_id?}
        #    signature_data: dict[field_id] -> dataURL
        if not signature_data or not signed_fields:
            raise ValueError("signature_data et signed_fields requis")
    
        # 1) Construire la liste des 'sources' (docs) et calculer les offsets de pages.
        sources = []  # liste de tuples (key, file_field, reader, num_pages)
        if envelope.document_file:
            # Cas "mono-doc historique" (key 'main')
            f = envelope.document_file
            fh = f.open('rb')
            reader = PdfReader(fh)
            sources.append(('main', f, reader, len(reader.pages)))
        else:
            docs = envelope.documents.all().order_by('id')
            if not docs.exists():
                raise ValueError("Aucun document original dans l'enveloppe")
            for d in docs:
                fh = d.file.open('rb')
                reader = PdfReader(fh)
                sources.append((str(d.id), d.file, reader, len(reader.pages)))
    
        # Offsets globaux (pour retrouver l'index de page dans un PDF fusionné)
        offsets = {}
        total_pages = 0
        for key, _file, reader, n in sources:
            offsets[key] = total_pages
            total_pages += n
    
        # 2) Construire la base PDF à surimprimer
        #    - Si un précédent signed_file existe => on repart de ce PDF
        #    - Sinon on concatène toutes les sources dans l'ordre
        prev = (
            SignatureDocument.objects
            .filter(envelope=envelope, signed_file__isnull=False)
            .order_by('-signed_at')
            .first()
        )
    
        base_reader = None
        base_stream_handles = []  # pour garder les handles ouverts vivants jusqu'à la fin
        if prev and prev.signed_file:
            # Point de départ = dernier PDF signé (déjà fusionné/concaténé)
            fh = prev.signed_file.open('rb')
            base_stream_handles.append(fh)
            base_reader = PdfReader(fh)
        else:
            # Concaténer les sources pour obtenir un PDF de base
            tmp_writer = PdfWriter()
            for key, _file, reader, _n in sources:
                for p in reader.pages:
                    tmp_writer.add_page(p)
            tmp_buf = io.BytesIO()
            tmp_writer.write(tmp_buf)
            tmp_buf.seek(0)
            base_stream_handles.append(tmp_buf)
            base_reader = PdfReader(tmp_buf)
    
        # 3) Préparer la liste des overlays par page globale
        #    Pour chaque champ, on détermine sa page globale : offset[doc_key] + (page-1)
        overlays_by_global_page = {}  # index_page -> [ (pos, data_url) ... ]
        for field_id, data_url in signature_data.items():
            fmeta = signed_fields.get(str(field_id)) or signed_fields.get(field_id)
            if not fmeta:
                continue
            # clé document
            doc_key = None
            # champs venant du serializer : 'document_id' ou 'document'
            if 'document_id' in fmeta and fmeta['document_id'] is not None:
                doc_key = str(fmeta['document_id'])
            elif 'document' in fmeta and fmeta['document'] is not None:
                doc_key = str(fmeta['document'])
            else:
                # legacy mono-doc
                doc_key = 'main'
    
            if doc_key not in offsets:
                # Si on ne trouve pas la clé, ignorer proprement
                continue
    
            page = int(fmeta.get('page') or 1)
            pos = fmeta.get('position') or {}
            try:
                gx = int(pos.get('x', 0))
                gy_t = int(pos.get('y', 0))
                gw = int(pos.get('width', 0))
                gh = int(pos.get('height', 0))
            except Exception:
                # position invalide
                continue
    
            global_index = offsets[doc_key] + (page - 1)
            overlays_by_global_page.setdefault(global_index, []).append(
                {'x': gx, 'y_top': gy_t, 'w': gw, 'h': gh, 'data_url': data_url}
            )
    
        # 4) Appliquer les overlays page par page sur la base
        writer = PdfWriter()
        for idx, page in enumerate(base_reader.pages):
            # Dimensions de la page courante
            media = page.mediabox
            pw, ph = float(media.width), float(media.height)
    
            if idx in overlays_by_global_page:
                packet = io.BytesIO()
                c = canvas.Canvas(packet, pagesize=(pw, ph))
    
                for item in overlays_by_global_page[idx]:
                    x = item['x']
                    w = item['w']
                    h = item['h']
                    # convertir y depuis le haut : PDF a l'origine en bas-gauche
                    y = ph - item['y_top'] - h
    
                    try:
                        b64 = item['data_url'].split(',')[1]
                        img = ImageReader(io.BytesIO(base64.b64decode(b64)))
                        c.drawImage(img, x, y, width=w, height=h, mask='auto')
                    except Exception:
                        # on ignore un overlay foireux, mais on continue
                        pass
    
                c.showPage()
                c.save()
                packet.seek(0)
                overlay_reader = PdfReader(packet)
                page.merge_page(overlay_reader.pages[0])
    
            writer.add_page(page)
    
        # 5) Retourner un ContentFile prêt pour signature numérique
        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
    
        # fermer les handles ouverts
        for h in base_stream_handles:
            try:
                h.close()
            except Exception:
                pass
    
        return ContentFile(out.read(), name=f"merged_{envelope.id}.pdf")
    
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