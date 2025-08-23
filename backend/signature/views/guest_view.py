from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.views.decorators.clickjacking import xframe_options_exempt
from ..models import Envelope, EnvelopeRecipient, SignatureDocument
from ..serializers import EnvelopeSerializer
from .recipient_view import EnvelopeViewSet
from .helpers import verify_guest_token, safe_filename, serve_pdf

@api_view(['GET'])
@permission_classes([AllowAny])
def guest_envelope_view(request, pk):
    envelope = get_object_or_404(Envelope, pk=pk)

    token = (
        request.GET.get('token')
        or request.POST.get('token')
        or request.headers.get('X-Signature-Token')
        or (request.headers.get('Authorization', '').replace('Bearer ', '')
            if request.headers.get('Authorization') else '')
    )

    payload = verify_guest_token(envelope, token)
    if payload is None:
        return Response({'error': 'Token invalide ou manquant'}, status=status.HTTP_403_FORBIDDEN)

    recipient_id = payload.get('recipient_id')
    try:
        recipient = EnvelopeRecipient.objects.get(envelope=envelope, id=recipient_id)
    except EnvelopeRecipient.DoesNotExist:
        return Response({'error': 'Destinataire non valide'}, status=status.HTTP_403_FORBIDDEN)

    data = EnvelopeSerializer(envelope).data
    fields = EnvelopeViewSet()._build_fields_payload(envelope, current_recipient_id=recipient.id)

    from django.urls import reverse
    doc_path = reverse('signature-serve-decrypted-pdf', kwargs={'pk': envelope.id})
    document_url = request.build_absolute_uri(f"{doc_path}?token={token}")

    data.update({
        'fields': fields,
        'recipient_id': recipient.id,
        'recipient_full_name': recipient.full_name,
        'document_url': document_url,
    })
    return Response(data)

@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
@xframe_options_exempt
def serve_decrypted_pdf(request, pk: int):
    envelope = get_object_or_404(Envelope, pk=pk)

    token = (
        request.GET.get("token")
        or request.headers.get("X-Signature-Token")
        or (request.headers.get("Authorization", "").replace("Bearer ", "")
            if request.headers.get("Authorization") else "")
    )

    payload = verify_guest_token(envelope, token)
    if payload is None:
        return Response({"error": "Token invalide ou manquant"}, status=status.HTTP_403_FORBIDDEN)

    if envelope.status == 'completed':
        sig_doc = (
            SignatureDocument.objects
            .filter(envelope=envelope, signed_file__isnull=False)
            .order_by('-signed_at')
            .first()
        )
        if sig_doc and sig_doc.signed_file:
            filename = safe_filename(envelope.title or "document")
            return serve_pdf(sig_doc.signed_file, filename, inline=True)

    doc = envelope.document_file or (envelope.documents.first().file if envelope.documents.exists() else None)
    if not doc:
        return Response({"error": "Pas de document disponible"}, status=status.HTTP_404_NOT_FOUND)

    filename = safe_filename(envelope.title or "document")
    return serve_pdf(doc, filename, inline=True)
