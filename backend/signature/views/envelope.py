from rest_framework import viewsets, permissions
from rest_framework.decorators import (
    action,
    api_view,
    permission_classes,
    authentication_classes,
    parser_classes,
)
from django.utils.text import get_valid_filename

from signature.storages import AADContentFile
from django.utils.decorators import method_decorator
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.http import Http404, FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.views.decorators.clickjacking import xframe_options_exempt
from django.db.models import Q
import io,qrcode,logging,jwt,base64,uuid
from django.conf import settings
from ..tasks import send_signature_email,send_document_completed_notification,send_signed_pdf_to_all_signers
from ..otp import generate_otp, validate_otp, send_otp
from ..hsm import hsm_sign
from jwt import InvalidTokenError, ExpiredSignatureError
from ..models import ( Envelope,EnvelopeRecipient,SignatureDocument,PrintQRCode,EnvelopeDocument,)
from ..serializers import (EnvelopeSerializer,EnvelopeListSerializer,SigningFieldSerializer,SignatureDocumentSerializer,PrintQRCodeSerializer,)
from signature.crypto_utils import sign_pdf_bytes,compute_hashes, extract_signer_certificate_info
from reportlab.pdfgen import canvas
from django.core.files.base import ContentFile
from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from django.http import HttpResponse
from rest_framework import status
from ..utils import stream_hash



logger = logging.getLogger(__name__)


# =============================================================
#                       HELPERS FACTORISÉS
# =============================================================

def _clean_b64(data: str | None) -> str | None:
    """
    Accepte 'data:image/...;base64,AAAA' ou déjà 'AAAA', renvoie le base64 pur ou None.
    """
    if not data:
        return None
    if isinstance(data, str) and data.startswith('data:image'):
        return data.split(',', 1)[1]
    return data


def _get_envelope_by_identifier(identifier, *, queryset=None):
    """Resolve an envelope by UUID public_id or integer primary key."""
    qs = queryset if queryset is not None else Envelope.objects.all()
    if isinstance(identifier, uuid.UUID):
        return qs.get(public_id=identifier)

    identifier_str = str(identifier or '').strip()
    if not identifier_str:
        raise Envelope.DoesNotExist

    try:
        uuid_value = uuid.UUID(identifier_str)
    except (ValueError, TypeError):
        try:
            pk_value = int(identifier_str)
        except (TypeError, ValueError):
            raise Envelope.DoesNotExist
        return qs.get(pk=pk_value)
    else:
        return qs.get(public_id=uuid_value)


def _get_envelope_or_404(identifier, *, queryset=None):
    try:
        return _get_envelope_by_identifier(identifier, queryset=queryset)
    except Envelope.DoesNotExist:
        raise Http404("Envelope not found")

def _verify_guest_token(envelope, token):
    """
    Retourne le payload (dict) si le token invité est valide et correspond à l'enveloppe,
    sinon None.
    """
    if not token:
        return None
    secret = getattr(settings, "SIGNATURE_JWT_SECRET", settings.SECRET_KEY)
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        env_id = payload.get("env_id")
        if env_id is None:
            return None
        expected = {str(envelope.public_id), str(envelope.id)}
        if str(env_id) not in expected:
            return None
        return payload
    except (ExpiredSignatureError, InvalidTokenError):
        return None

@api_view(['GET'])
@permission_classes([AllowAny])
def guest_envelope_view(request, public_id):
    envelope = get_object_or_404(Envelope, public_id=public_id)

    token = (
        request.GET.get('token')
        or request.POST.get('token')
        or request.headers.get('X-Signature-Token')
        or (request.headers.get('Authorization', '').replace('Bearer ', '')
            if request.headers.get('Authorization') else '')
    )

    payload = _verify_guest_token(envelope, token)
    if payload is None:
        return Response({'error': 'Token invalide ou manquant'}, status=status.HTTP_403_FORBIDDEN)

    # On récupère recipient_id depuis le payload retourné
    recipient_id = payload.get('recipient_id')
    try:
        recipient = EnvelopeRecipient.objects.get(envelope=envelope, id=recipient_id)
    except EnvelopeRecipient.DoesNotExist:
        return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

    data = EnvelopeSerializer(envelope).data
    fields = EnvelopeViewSet()._build_fields_payload(envelope, current_recipient_id=recipient.id)

    # Construire l’URL du PDF (adapte le name de route si besoin)
    from django.urls import reverse
    doc_path = reverse(
        'signature-serve-decrypted-pdf', kwargs={'public_id': envelope.public_id}
    )
    document_url = request.build_absolute_uri(f"{doc_path}?token={token}")

    data.update({
        'fields': fields,
        'recipient_id': recipient.id,
        'recipient_full_name': recipient.full_name,
        'document_url': document_url,
    })
    return Response(data)

def _safe_filename(name: str) -> str:
    base = (name or "document").replace('"', "").strip() or "document"
    if not base.lower().endswith(".pdf"):
        base += ".pdf"
    return base

    
class EnvelopeViewSet(viewsets.ModelViewSet):
    serializer_class = EnvelopeSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        identifier = self.kwargs.get(lookup_url_kwarg)
        if identifier is not None:
            queryset = self.filter_queryset(self.get_queryset())
            try:
                uuid_value = uuid.UUID(str(identifier))
            except (TypeError, ValueError):
                pass
            else:
                obj = get_object_or_404(queryset, public_id=uuid_value)
                self.check_object_permissions(self.request, obj)
                return obj
        return super().get_object()

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
            return (
                Envelope.objects
                .filter(status__in=['sent', 'pending'])
                .filter(recipient_filter & Q(recipients__signed=False))
            ).distinct().order_by('-created_at')

        # 4) Complétées : créateur + destinataires ayant signé
        if status_q == 'completed':
            return (
                Envelope.objects.filter(status='completed')
                .filter(
                    Q(created_by=user) | (recipient_filter & Q(recipients__signed=True))
                )
            ).distinct().order_by('-created_at')

        # 5) Page “Documents” (tout : créateur + destinataires)
        return (
            Envelope.objects
            .filter(Q(created_by=user) | recipient_filter)
        ).distinct().order_by('-created_at')

    # -------------------- Helpers internes --------------------
    def _get_token(self, request) -> str | None:
        return (
            request.data.get('token')
            or request.GET.get('token')
            or request.headers.get('X-Signature-Token', '')
            or request.headers.get('Authorization', '').replace('Bearer ', '')
        ) or None

    def _resolve_guest_recipient(self, envelope: Envelope, token: str) -> EnvelopeRecipient | None:
        """Vérifie le token, décode le JWT et renvoie le destinataire invité ou None."""
        if not self._verify_token(envelope, token):
            return None
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            rid = payload.get('recipient_id')
            return EnvelopeRecipient.objects.get(envelope=envelope, id=rid)
        except (jwt.InvalidTokenError, EnvelopeRecipient.DoesNotExist):
            return None

    def _enforce_sequential(self, envelope: Envelope, recipient: EnvelopeRecipient) -> Response | None:
        if envelope.flow_type == 'sequential':
            prev = envelope.recipients.filter(order__lt=recipient.order)
            if prev.filter(signed=False).exists():
                return Response({'error': "Les destinataires précédents doivent signer d'abord"}, status=status.HTTP_400_BAD_REQUEST)
        return None

    def _select_pdf(self, envelope: Envelope, prefer_signed: bool = True):
        """Retourne (file_field, filename_suffix). Lève ValueError si aucun document."""
        if prefer_signed:
            sig_doc = (
                SignatureDocument.objects
                .filter(envelope=envelope, signed_file__isnull=False)
                .order_by('-signed_at')
                .first()
            )
            if sig_doc:
                return sig_doc.signed_file, 'signed'
        # sinon original
        doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
        if not doc:
            raise ValueError('Pas de document disponible')
        return doc, 'original'

    def _ensure_creator(self, request, envelope: Envelope):
        if envelope.created_by_id != request.user.id:
            return Response(
                {"error": "Action réservée au créateur de l'enveloppe"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def _delete_envelope_files(self, envelope: Envelope) -> None:
        files_to_delete = []

        if envelope.document_file and envelope.document_file.name:
            files_to_delete.append(envelope.document_file)

        for doc in envelope.documents.all():
            if doc.file and doc.file.name:
                files_to_delete.append(doc.file)

        for signature in envelope.signatures.all():
            if signature.signed_file and signature.signed_file.name:
                files_to_delete.append(signature.signed_file)

        for field_file in files_to_delete:
            try:
                field_file.delete(save=False)
            except FileNotFoundError:
                continue

    @staticmethod
    def _serve_pdf(file_field, filename: str, inline: bool = True):
        fh = file_field.storage.open(file_field.name, "rb")
        resp = FileResponse(fh, content_type="application/pdf")
        disp = "inline" if inline else "attachment"
        safe_name = get_valid_filename(filename)
        resp["Content-Disposition"] = f'{disp}; filename="{safe_name}"; filename*=UTF-8\'\'{safe_name}'
        resp["X-Frame-Options"] = "SAMEORIGIN"
        frame_ancestors = getattr(settings, "SIGNATURE_FRAME_ANCESTORS", "'self'")
        resp["Content-Security-Policy"] = f"frame-ancestors {frame_ancestors}; sandbox allow-scripts allow-forms allow-same-origin"
        resp["Cache-Control"] = "no-store"
        resp["Pragma"] = "no-cache"
        resp["Expires"] = "0"
        return resp

    def _build_fields_payload(self, envelope: Envelope, current_recipient_id: int | None = None):
        fields = []
        for f in envelope.fields.all():
            fld = SigningFieldSerializer(f).data
            assigned: EnvelopeRecipient = f.recipient

            # statut + last signature_data si signé
            fld['signed'] = assigned.signed
            if assigned.signed:
                sig_doc = (
                    SignatureDocument.objects
                    .filter(envelope=envelope, recipient=assigned)
                    .order_by('-signed_at')
                    .first()
                )
                fld['signature_data'] = sig_doc.signature_data if sig_doc else None
            else:
                fld['signature_data'] = None

            fld['editable'] = (current_recipient_id is not None and assigned.id == current_recipient_id and not assigned.signed)
            fields.append(fld)
        return fields

    def _signed_filename(self, envelope_id: int, recipient_id: int, now: timezone.datetime | None = None) -> str:
        ts = (now or timezone.now()).strftime('%Y%m%d_%H%M%S')
        return f"signed_{envelope_id}_{recipient_id}_{ts}.pdf"

    def _notify_next_recipient_if_needed(self, envelope: Envelope):
        if envelope.flow_type == 'sequential' and envelope.status != 'completed':
            next_rec = envelope.recipients.filter(signed=False).order_by('order').first()
            if next_rec:
                send_signature_email.delay(envelope.id, next_rec.id)

    # -------------------- Actions / endpoints --------------------

    @action(detail=True, methods=['get'], url_path='sign-page', permission_classes=[IsAuthenticated])
    def sign_page(self, request, pk=None):
        """
        Page de signature pour un utilisateur authentifié (sans OTP/token invité).
        Renvoie l’enveloppe + champs signables + infos destinataire.
        """
        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)
        try:
            rec = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Vous n’êtes pas destinataire'}, status=403)

        data = EnvelopeSerializer(envelope).data
        data.update({
            'fields': self._build_fields_payload(envelope, current_recipient_id=rec.id),
            'recipient_id': rec.id,
            'recipient_full_name': rec.full_name,
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
        if 'include_qr_code' in request.data:
            envelope.include_qr_code = bool(request.data.get('include_qr_code'))
 
        if not envelope.deadline_at:
            envelope.deadline_at = timezone.now() + timezone.timedelta(days=7)
        envelope.status = 'sent'
        envelope.save()
        envelope.save(update_fields=['include_qr_code', 'deadline_at', 'status'])

        # Planification des rappels & envoi au(x) premier(s)
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

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def cancel(self, request, pk=None):
        envelope = self.get_object()
        permission_error = self._ensure_creator(request, envelope)
        if permission_error:
            return permission_error
        if envelope.status in ['completed', 'cancelled']:
            return Response({'error': 'Document déjà finalisé'}, status=status.HTTP_400_BAD_REQUEST)
        envelope.status = 'cancelled'
        envelope.cancelled_at = timezone.now()
        envelope.save(update_fields=['status', 'cancelled_at'])
        return Response({'status': 'cancelled', 'message': 'Document annulé'})

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def restore(self, request, pk=None):
        envelope = self.get_object()
        permission_error = self._ensure_creator(request, envelope)
        if permission_error:
            return permission_error
        if envelope.status != "cancelled":
            return Response({"error": "Non annulé"}, status=status.HTTP_400_BAD_REQUEST)
        envelope.status = "draft"
        envelope.cancelled_at = None
        envelope.save(update_fields=['status', 'cancelled_at'])
        return Response({"status": "draft"})

    @action(detail=True, methods=["delete"], url_path="purge", permission_classes=[IsAuthenticated])
    def purge(self, request, pk=None):
        envelope = self.get_object()
        permission_error = self._ensure_creator(request, envelope)
        if permission_error:
            return permission_error
        self._delete_envelope_files(envelope)
        envelope.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---------- OTP (invités) ----------
    @action(detail=True, methods=['post'], url_path='send_otp', permission_classes=[permissions.AllowAny])
    def send_otp(self, request, pk=None):
        token = self._get_token(request)
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)

        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)

        recipient = self._resolve_guest_recipient(envelope, token)
        if not recipient:
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

        seq_err = self._enforce_sequential(envelope, recipient)
        if seq_err:
            return seq_err

        otp = generate_otp(recipient)
        send_otp(recipient, otp)
        if recipient.user:
            recipient.in_app_notified = True
            recipient.notified_at = timezone.now()
            recipient.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

  # ... dans EnvelopeViewSet, action verify_otp ...

    @action(detail=True, methods=['post'], url_path='verify_otp', permission_classes=[permissions.AllowAny])
    def verify_otp(self, request, pk=None):
        token = self._get_token(request)
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)
    
        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)
    
        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)
    
        recipient = self._resolve_guest_recipient(envelope, token)
        if not recipient:
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)
    
        seq_err = self._enforce_sequential(envelope, recipient)
        if seq_err:
            return seq_err
    
        # --- NORMALISATION OTP ---
        raw_otp = request.data.get('otp')
        otp = str(raw_otp).strip() if raw_otp is not None else ''
        if not otp.isdigit():
            # éviter les rejets “OTP invalide” ambigus quand l’input contient des espaces/caractères
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)
    
        # --- VÉRIFICATION ---
        try:
            is_valid, blocked = validate_otp(recipient, otp)
        except Exception as e:
            # en cas d’implémentation OTP défaillante
            import logging
            logging.getLogger(__name__).exception("Erreur validate_otp")
            return Response({'error': 'Erreur vérification OTP'}, status=500)
    
        if blocked:
            return Response({'error': 'Trop de tentatives, OTP verrouillé'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    
        if not is_valid:
            # log utile pour diagnostiquer recipients/token
            import logging
            logging.getLogger(__name__).info(
                "OTP invalid for recipient_id=%s envelope_id=%s",
                recipient.id, envelope.id
            )
            return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)
    
        # OK
        return Response({'status': 'otp_verified'}, status=status.HTTP_200_OK)
    

    # ---------- Téléchargement / Visualisation ----------
    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Renvoie une URL de téléchargement :
        - s’il existe déjà un PDF signé (même en 'pending'), on propose l’URL du signé,
        - sinon, l’URL de l’original.
        """
        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        is_owner = (envelope.created_by == request.user)
        is_signed_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_signed_recipient):
            return Response({'error': 'Non autorisé'}, status=403)

        try:
            sig_doc = (
                SignatureDocument.objects
                .filter(envelope=envelope, signed_file__isnull=False)
                .order_by('-signed_at').first()
            )
            identifier = str(envelope.public_id)
            if sig_doc:
                download_url = request.build_absolute_uri(
                    f'/api/signature/envelopes/{identifier}/signed-document/'
                )
            else:
                # original
                if envelope.document_file or envelope.documents.exists():
                    download_url = request.build_absolute_uri(
                        f'/api/signature/envelopes/{identifier}/original-document/'
                    )
                else:
                    return Response({'error': 'Pas de document disponible'}, status=404)
            return Response({'download_url': download_url})
        except Exception as e:
            return Response({'error': f'Échec d\'obtention de l\'URL : {e}'}, status=500)

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<doc_id>\d+)/file')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def document_file(self, request, pk=None, doc_id=None):
        """Fournit un PDF original par sous-document (auth requis)."""
        try:
            envelope = _get_envelope_by_identifier(pk)
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

        filename = doc.name or f"document_{doc.id}.pdf"
        return EnvelopeViewSet._serve_pdf(doc.file, filename)

    @action(detail=True, methods=['get'], url_path='original-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def original_document(self, request, pk=None):
        """Fournit le PDF original (auth requis : créateur ou destinataire)."""
        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=status.HTTP_404_NOT_FOUND)

        is_owner = (envelope.created_by == request.user)
        is_recipient = envelope.recipients.filter(user=request.user).exists()
        if not (is_owner or is_recipient):
            return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)

        try:
            doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
            if not doc:
                return Response({'error': 'Pas de document original'}, status=status.HTTP_404_NOT_FOUND)
            filename = f"{envelope.title}.pdf"
            return EnvelopeViewSet._serve_pdf(doc, filename, inline=True)
        except Exception as e:
            return Response({'error': f'Échec d\'ouverture du fichier : {e}'}, status=500)

    
    @action(detail=True, methods=['get'], url_path='signed-document')
    @method_decorator(xframe_options_exempt, name='dispatch')
    def signed_document(self, request, pk=None):
        env = self.get_object()
    
        last_sig = (SignatureDocument.objects
                    .filter(envelope=env)
                    .order_by('-signed_at')
                    .first())
    
        if not last_sig or not last_sig.signed_file:
            return Response({'error': 'Pas de fichier signé'}, status=404)
    
        # Nom de fichier propre et sûr
        default_name = f"envelope-{env.id or 'document'}.pdf"
        file_name = (last_sig.signed_file.name.split('/')[-1] or default_name)
        file_name = get_valid_filename(file_name)
        if not file_name.lower().endswith('.pdf'):
            file_name += '.pdf'
    
        # IMPORTANT : ne pas définir Content-Disposition à la main ici.
        file_obj = last_sig.signed_file.open('rb')  # FieldFile.open()
        return FileResponse(
            file_obj,
            as_attachment=True,            # téléchargement
            filename=file_name,            # => Django génère exactement 1 seul Content-Disposition
            content_type='application/pdf'
        )
    
    

    
    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def sign(self, request, pk=None):
        
        token = self._get_token(request)
        if not token:
            return Response({'error': 'Token requis'}, status=status.HTTP_403_FORBIDDEN)

        try:
            envelope = _get_envelope_by_identifier(pk)
        except Envelope.DoesNotExist:
            return Response({'error': 'Enveloppe non trouvée'}, status=404)

        recipient = self._resolve_guest_recipient(envelope, token)
        if not recipient:
            return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)

        seq_err = self._enforce_sequential(envelope, recipient)
        if seq_err:
            return seq_err

        signature_data = request.data.get('signature_data')
        signed_fields = request.data.get('signed_fields') or {}
        if not signature_data or not signed_fields:
            return Response({'error': 'signature_data et signed_fields requis'}, status=status.HTTP_400_BAD_REQUEST)

        # (Facultatif) OTP inline si souhaité :
        # otp = request.data.get('otp')
        # if otp:
        #     is_valid, blocked = validate_otp(recipient, otp)
        #     if blocked:
        #         return Response({'error': 'Trop de tentatives, OTP verrouillé'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        #     if not is_valid:
        #         return Response({'error': 'OTP invalide'}, status=status.HTTP_400_BAD_REQUEST)

        return self._do_sign(envelope, recipient, signature_data, signed_fields)

    @action(detail=True, methods=['post'], url_path='sign_authenticated')
    def sign_authenticated(self, request, pk=None):
        """Signature par un utilisateur authentifié (façade → _do_sign)."""
        envelope = self.get_object()
        signature_data = request.data.get('signature_data')
        signed_fields = request.data.get('signed_fields') or {}

        try:
            recipient = envelope.recipients.get(user=request.user)
        except EnvelopeRecipient.DoesNotExist:
            return Response({"detail": "Aucun destinataire correspondant."}, status=status.HTTP_403_FORBIDDEN)

        self._do_sign(envelope, recipient, signature_data, signed_fields)
        return Response({"detail": "Document signé avec succès."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def hsm_sign(self, request, pk=None):
        """Signature via HSM (PIN requis)."""
        recipient_id = request.data.get('recipient_id')
        if not recipient_id:
            return Response({'error': 'recipient_id requis'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            envelope_uuid = uuid.UUID(str(pk))
            envelope_filter = {'envelope__public_id': envelope_uuid}
        except (TypeError, ValueError):
            envelope_filter = {'envelope__pk': pk}

        try:
            recipient = EnvelopeRecipient.objects.get(id=recipient_id, **envelope_filter)
        except EnvelopeRecipient.DoesNotExist:
            return Response({'error': 'Destinataire non trouvé'}, status=status.HTTP_404_NOT_FOUND)

        envelope = recipient.envelope

        if self._refuse_if_deadline_passed(envelope):
            return Response({'error': 'Échéance dépassée. La signature est fermée.'}, status=400)

        seq_err = self._enforce_sequential(envelope, recipient)
        if seq_err:
            return seq_err

        pin = request.data.get('pin')
        try:
            signature = hsm_sign(recipient, pin)
            return self._do_sign(envelope, recipient, signature, request.data.get('signed_fields', {}))
        except Exception as e:
            return Response({'error': f'Erreur HSM : {e}'}, status=status.HTTP_400_BAD_REQUEST)

        # ---------- Cœur de signature ----------
    def _do_sign(self, envelope, recipient, signature_data, signed_fields):
        # 1) Trouver TOUS les champs de CE destinataire
        my_fields_meta = []
        for _, meta in (signed_fields or {}).items():
            if not meta:
                continue
            rid = str(meta.get('recipient_id') or meta.get('assigned_recipient_id') or "")
            if rid and rid == str(recipient.id):
                my_fields_meta.append(meta)
    
        # fallback si rien trouvé → on prend au moins un
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
            with latest.signed_file.storage.open(latest.signed_file.name, 'rb') as bf:
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
    
        # 3) TRAITEMENT CHAMP PAR CHAMP : overlay + signature immédiatement
        for i, fmeta in enumerate(my_fields_meta):
            pos = fmeta.get('position') or {}
            page_num = int(fmeta.get('page') or 1)
            page_ix = max(0, page_num - 1)

            reader_dim = PdfReader(io.BytesIO(base_bytes))
            page = reader_dim.pages[page_ix]
            page_w = float(page.mediabox.width)
            page_h = float(page.mediabox.height)

            try:
                x_rel = float(pos.get('x', 0)); y_rel = float(pos.get('y', 0))
                w_rel = float(pos.get('width', 0)); h_rel = float(pos.get('height', 0))
            except Exception:
                x_rel = y_rel = 0
                w_rel = 180 / page_w
                h_rel = 60 / page_h

            x = x_rel * page_w
            y_top = y_rel * page_h
            w = w_rel * page_w
            h = h_rel * page_h
    
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
    
            # A) Overlay graphique si image dispo
            if img_for_this_field:
                logger.info(f"_do_sign: ajout overlay graphique pour champ {field_id}")
                base_bytes = self._add_signature_overlay_to_pdf(
                    base_bytes, img_for_this_field, x, y_top, w, h, page_ix
                )
    
            # B) Signature numérique (sans apparence)
            reader = PdfReader(io.BytesIO(base_bytes))
            page_h = float(reader.pages[page_ix].mediabox.height)
            y_pdf = page_h - (y_top + h)
            rect_crypto = (x + 1, y_pdf + 1, x + w - 1, y_pdf + h - 1)
    
            signature_timestamp = timezone.now().strftime("%Y%m%d_%H%M%S_%f")
            unique_suffix = str(uuid.uuid4())[:8]
            unique_field_name = f"Sig_{recipient.id}_{field_id}_{i}_{signature_timestamp}_{unique_suffix}"
    
            logger.info(f"_do_sign: ajout signature numérique {unique_field_name} pour champ {field_id}")
    
            base_bytes = sign_pdf_bytes(
                base_bytes,
                field_name=unique_field_name,
                reason=f"Signature numérique - {recipient.full_name}",
                location="Plateforme IntelliVibe",
                rect=rect_crypto,
                page_ix=page_ix,
                appearance_image_b64=img_for_this_field,
            )
    
            logger.info(f"_do_sign: champ {i+1}/{len(my_fields_meta)} traité avec succès")
    
        # 4) Sauvegarder le résultat & statut
        with transaction.atomic():
            # 1) Marquer le destinataire comme signé
            recipient.signed = True
            recipient.signed_at = timezone.now()
            recipient.save(update_fields=["signed", "signed_at"])
        
            # 2) Créer l'objet SignatureDocument
            sig_doc = SignatureDocument.objects.create(
                envelope=envelope,
                recipient=recipient,
                signer=(self.request.user if self.request and self.request.user.is_authenticated else None),
                is_guest=(recipient.user is None),
                signature_data=signature_data,
                signed_fields=signed_fields,
                ip_address=self.request.META.get("REMOTE_ADDR"),
                user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            )
        
            # 3) Sauvegarder le PDF signé initial (bytes = base_bytes)
            file_name = self._signed_filename(envelope.id, recipient.id)
            # IMPORTANT : AAD = doc_uuid de l'enveloppe (immutabilité de l'identité)
            aad = envelope.doc_uuid.bytes
            sig_doc.signed_file.save(file_name, AADContentFile(base_bytes, aad), save=True)
        
            # 3a) Empreintes (streaming) + infos certificat sur le PDF signé
            try:
                hashes = stream_hash(sig_doc.signed_file, want_md5=True)  # mémoire constante
                cert_info = extract_signer_certificate_info()
        
                prior = sig_doc.certificate_data or {}
                sig_doc.certificate_data = {
                    **prior,
                    "hash_sha256": hashes.get("hash_sha256"),
                    "hash_md5": hashes.get("hash_md5"),
                    "certificate": cert_info,  # {common_name, organization, country, serial_number}
                    "qr_embedded": bool(prior.get("qr_embedded", False)),
                }
                sig_doc.save(update_fields=["certificate_data"])
            except Exception:
                logger.exception("Impossible de calculer les empreintes / infos cert (stream)")
        
            logger.info(f"[SIGN] PDF signé sauvegardé → {sig_doc.signed_file.name}")
        
            # 3b) Si c'était le DERNIER signataire : apposer le QR + re-scellement
            if envelope.include_qr_code and not envelope.recipients.filter(signed=False).exists():
                try:
                    # Générer / réutiliser un QR permanent
                    qr = envelope.qr_codes.filter(qr_type="permanent").first()
                    if not qr:
                        qr = PrintQRCode.objects.create(envelope=envelope, qr_type="permanent")
        
                    # Construire URL FRONT propre
                    front_base = getattr(settings, "FRONT_BASE_URL", "").rstrip("/")
                    if front_base:
                        verify_url = f"{front_base}/verify/{qr.uuid}?sig={qr.hmac}"
                    else:
                        verify_url = self.request.build_absolute_uri(f"/verify/{qr.uuid}?sig={qr.hmac}")
        
                    # Anti-doublon: si déjà posé/scellé, ne pas recommencer
                    already_qr = bool((sig_doc.certificate_data or {}).get("qr_embedded"))
                    if not already_qr:
                        # Lire les octets du PDF signé actuel (nécessaire pour l'overlay)
                        with sig_doc.signed_file.storage.open(sig_doc.signed_file.name, "rb") as fh:
                            pdf_bytes_for_overlay = fh.read()

                        


        
                        # Générer le PNG du QR
                        img = qrcode.make(verify_url)
                        buf = io.BytesIO()
                        img.save(buf, format="PNG")
                        qr_png = buf.getvalue()
        
                        # Apposer le QR sur toutes les pages
                        stamped = self._add_qr_overlay_to_pdf(pdf_bytes_for_overlay, qr_png)
        
                        # Re-signer/sceller le PDF après overlay
                        final_signed = sign_pdf_bytes(stamped, field_name="FinalizeQR")
        
                        # Sauvegarder le PDF final (en gardant le même AAD)
                        sig_doc.signed_file.save(file_name, AADContentFile(final_signed, aad), save=True)
        
                        # Recalculer les empreintes (streaming) + infos certificat
                        try:
                            hashes = stream_hash(sig_doc.signed_file, want_md5=True)
                            cert_info = extract_signer_certificate_info()
        
                            sig_doc.certificate_data = {
                                **(sig_doc.certificate_data or {}),
                                "hash_sha256": hashes.get("hash_sha256"),
                                "hash_md5": hashes.get("hash_md5"),
                                "certificate": cert_info,
                                "qr_embedded": True,
                            }
                            sig_doc.save(update_fields=["certificate_data"])
                        except Exception:
                            logger.exception("Impossible de recalculer les empreintes (stream) après overlay")
                except Exception as e:
                    logger.exception(f"QR overlay/scellage échoué: {e}")
        
            # 4) Mettre à jour le statut de l'enveloppe
            unsigned_exists = envelope.recipients.filter(signed=False).exists()
            if unsigned_exists:
                if envelope.status != "pending":
                    envelope.status = "pending"
                    envelope.save(update_fields=["status"])
                logger.info(f"[SIGN] Envelope {envelope.id} encore en cours → status=pending")
            else:
                envelope.status = "completed"
                envelope.save(update_fields=["status"])
                logger.info(f"[SIGN] Envelope {envelope.id} COMPLETED ✅")
        
            # 5) Déclenchements APRÈS COMMIT
            def _after_commit():
                try:
                    if unsigned_exists:
                        logger.info(f"[SIGN] on_commit → notifier le prochain destinataire pour envelope {envelope.id}")
                        self._notify_next_recipient_if_needed(envelope)
                    else:
                        # Enveloppe complète → mails finaux
                        logger.info(f"[SIGN] on_commit → enqueue send_document_completed_notification({envelope.id})")
                        send_document_completed_notification.delay(envelope.id)
        
                        logger.info(f"[SIGN] on_commit → enqueue send_signed_pdf_to_all_signers({envelope.id})")
                        send_signed_pdf_to_all_signers.delay(envelope.id)
                except Exception as e:
                    logger.exception(f"[SIGN][ERR] on_commit error (envelope {envelope.id}): {e}")
        
            transaction.on_commit(_after_commit)
        return Response({'status': 'signed'})
    
    @action(detail=True, methods=['post'])
    def remind(self, request, pk=None):
        env = self.get_object()

        if env.status not in ['sent', 'pending']:
            return Response({'error': "L'enveloppe doit être envoyée/en cours pour relancer."},
                            status=status.HTTP_400_BAD_REQUEST)

        MAX_REMINDERS = 5  # ajuste selon ton besoin
        now = timezone.now()
        reminders_sent = 0

        qs = env.recipients.filter(signed=False)
        for rec in qs:
            # Éligibilité simple : plafond non atteint
            if (rec.reminder_count or 0) >= MAX_REMINDERS:
                continue

            # Mets à jour les compteurs & prochaines relances
            rec.reminder_count = (rec.reminder_count or 0) + 1
            rec.last_reminder_at = now
            rec.next_reminder_at = now + timezone.timedelta(days=env.reminder_days or 1)
            rec.save(update_fields=['reminder_count', 'last_reminder_at', 'next_reminder_at'])

            # Réutilise ton envoi d’email existant
            send_signature_email.delay(env.id, rec.id)
            reminders_sent += 1

        return Response({'reminders': reminders_sent}, status=status.HTTP_200_OK)
    
    @staticmethod
    def _add_qr_overlay_to_pdf(pdf_bytes: bytes, qr_png_bytes: bytes, *, size_pt=50, margin_pt=13, y_offset=-5):
        """
        Ajoute un QR code en bas à droite du PDF, plus petit et légèrement plus bas.
        - size_pt : taille du QR code (par défaut 60pt ≈ 0.8cm)
        - margin_pt : marge avec le bord droit
        - y_offset : permet de descendre un peu plus le QR (valeur négative -> plus bas)
        """
        base_reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
    
        for page in base_reader.pages:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
    
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=(w, h))
    
            # position : coin bas droit avec offset
            x = w - margin_pt - size_pt
            y = margin_pt + y_offset
    
            c.drawImage(
                ImageReader(io.BytesIO(qr_png_bytes)),
                x, y,
                width=size_pt, height=size_pt,
                mask='auto'
            )
            c.showPage()
            c.save()
            buf.seek(0)
    
            overlay_pdf = PdfReader(buf)
            page.merge_page(overlay_pdf.pages[0])
            writer.add_page(page)
    
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    
    

    def _add_signature_overlay_to_pdf(self, pdf_bytes, signature_data, x, y_top, w, h, page_ix):
        """Version améliorée qui préserve TOUJOURS les signatures existantes"""
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
            env_id = payload.get('env_id')
            if env_id is None:
                return False
            expected = {str(envelope.public_id), str(envelope.id)}
            return str(env_id) in expected and 'recipient_id' in payload
        except jwt.InvalidTokenError:
            return False


# ==================== Vues supplémentaires (invités) ====================



@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
@xframe_options_exempt
def serve_decrypted_pdf(request, public_id: uuid.UUID):
    """
    GET /api/signature/envelopes/<pk>/document/?token=...
    - si status == 'completed' => renvoie le PDF signé le plus récent
    - sinon => renvoie l'original (envelope.document_file ou premier sous-document .file)
    """
    envelope = get_object_or_404(Envelope, public_id=public_id)

    # token invité (query, header custom, bearer)
    token = (
        request.GET.get("token")
        or request.headers.get("X-Signature-Token")
        or (request.headers.get("Authorization", "").replace("Bearer ", "")
            if request.headers.get("Authorization") else "")
    )

    # utilise ton helper qui retourne le payload ou None
    payload = _verify_guest_token(envelope, token)
    if payload is None:
        return Response({"error": "Token invalide ou manquant"}, status=status.HTTP_403_FORBIDDEN)

    # 1) si complété, renvoyer le dernier PDF signé
    if envelope.status == 'completed':
        sig_doc = (
            SignatureDocument.objects
            .filter(envelope=envelope, signed_file__isnull=False)
            .order_by('-signed_at')
            .first()
        )
        if sig_doc and sig_doc.signed_file:
            filename = _safe_filename(envelope.title or "document")
            return EnvelopeViewSet._serve_pdf(sig_doc.signed_file, filename, inline=True)

    # 2) sinon : original (global ou premier sous-document)
    doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
    if not doc:
        return Response({"error": "Pas de document disponible"}, status=status.HTTP_404_NOT_FOUND)

    filename = _safe_filename(envelope.title or "document")
    return EnvelopeViewSet._serve_pdf(doc, filename, inline=True)

class PrintQRCodeViewSet(viewsets.ModelViewSet):
    serializer_class = PrintQRCodeSerializer
    permission_classes = [permissions.IsAuthenticated]

    lookup_field = "uuid"
    lookup_url_kwarg = "uuid"

    def get_queryset(self):
        # ✅ Vérification & document publics
        if getattr(self, "action", None) in ("verify", "page", "document"):
            return PrintQRCode.objects.all()
        # 🔐 le reste (ex: generate) réservé au propriétaire
        return PrintQRCode.objects.filter(envelope__created_by=self.request.user)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        envelope_id = request.data.get('envelope')
        try:
            envelope = Envelope.objects.get(id=envelope_id, created_by=request.user)
        except Envelope.DoesNotExist:
            return Response({'error': 'Document non trouvé'}, status=status.HTTP_404_NOT_FOUND)

        # Toujours "permanent"
        qr = PrintQRCode.objects.create(envelope=envelope, qr_type='permanent')
        serializer = self.get_serializer(qr)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    @action(detail=True, methods=['get'], url_path='document', permission_classes=[permissions.AllowAny])
    @xframe_options_exempt
    def document(self, request, *args, **kwargs):
        """Servez le PDF signé via un lien pérenne (uuid + hmac), sans JWT, et EMBEDDABLE."""
        try:
            qr = self.get_object()
        except Exception:
            return Response({'error': 'QR non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    
        sig = request.GET.get('sig')
        if not sig or sig != qr.hmac:
            return Response({'error': 'Signature HMAC manquante ou invalide'}, status=status.HTTP_403_FORBIDDEN)
        if not qr.is_valid:
            return Response({'error': 'QR révoqué'}, status=status.HTTP_403_FORBIDDEN)
    
        env = qr.envelope
        last_sig = SignatureDocument.objects.filter(envelope=env).order_by("-signed_at").first()

        if not last_sig or not last_sig.signed_file:
            return Response({'error': 'Aucun document signé'}, status=status.HTTP_404_NOT_FOUND)
    
        ev = EnvelopeViewSet(); ev.request = request 
        return EnvelopeViewSet._serve_pdf(last_sig.signed_file, f"{env.title}.pdf", inline=True)

    @action(detail=True, methods=['get'], permission_classes=[permissions.AllowAny])
    def verify(self, request, *args, **kwargs):
        """Preuve publique pérenne (aucun token, aucun expiry) + liste des signataires."""
        try:
            qr = self.get_object()
        except Exception:
            return Response({'error': 'QR non trouvé'}, status=status.HTTP_404_NOT_FOUND)
    
        sig = request.GET.get('sig')
        if not sig or sig != qr.hmac:
            return Response({'error': 'Signature HMAC manquante ou invalide'}, status=status.HTTP_403_FORBIDDEN)
    
        if not qr.is_valid:
            return Response({'error': 'QR révoqué'}, status=status.HTTP_403_FORBIDDEN)
    
        env = qr.envelope
        # Dernier document signé (si dispo)
        last_sig = (
            SignatureDocument.objects
            .filter(envelope=env)
            .order_by('-signed_at')
            .first()
        )
    
        # Construire la liste des signataires (nom + date)
        signers = []
        for r in env.recipients.order_by('order'):
            signers.append({
                'full_name': r.full_name,
                'email': r.email,
                'signed': bool(r.signed),
                'signed_at': r.signed_at.isoformat() if r.signed_at else None,
            })
    
        # URL absolue (PDF signé) pratique pour le front
        base_api = (request.build_absolute_uri('/')[:-1]).rstrip('/')
        doc_url = f"{base_api}/api/signature/prints/{qr.uuid}/document/?sig={sig}"
    
        # Payload de base
        payload = {
            'qr_uuid': str(qr.uuid),
            'envelope_id': env.id,
            'title': env.title,
            'status': env.status,
            'completed': (env.status == 'completed'),
            'completed_at': last_sig.signed_at.isoformat() if last_sig and last_sig.signed_file else None,
            'signers': signers,
            'document_url': doc_url,
        }
    
        # Ajouter empreintes + infos certificat
        cert_data = (last_sig.certificate_data or {}) if last_sig else {}
        payload.update({
            "hash_md5": cert_data.get("hash_md5"),
            "hash_sha256": cert_data.get("hash_sha256"),
            "certificate": {
                "common_name":  (cert_data.get("certificate") or {}).get("common_name"),
                "organization": (cert_data.get("certificate") or {}).get("organization"),
                "country":      (cert_data.get("certificate") or {}).get("country"),
                "serial_number":(cert_data.get("certificate") or {}).get("serial_number"),
            },
        })
    
        return Response(payload)
    