from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Envelope, EnvelopeRecipient, SigningField, SignatureDocument, PrintQRCode
from PyPDF2 import PdfReader
from django.db import transaction
import io
import logging

logger = logging.getLogger(__name__)

User = get_user_model()

class SigningFieldSerializer(serializers.ModelSerializer):
    recipient_id = serializers.IntegerField()

    class Meta:
        model = SigningField
        fields = ['id', 'recipient_id', 'field_type', 'page', 'position', 'name', 'required', 'default_value']

    def validate_position(self, value):
        required_keys = {'x', 'y', 'width', 'height'}
        if not isinstance(value, dict) or not all(key in value for key in required_keys):
            raise serializers.ValidationError('Position must include x, y, width, and height')
        return value

class EnvelopeRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvelopeRecipient
        fields = ['id', 'email', 'full_name', 'order', 'signed', 'signed_at', 'notified_at', 'reminder_count', 'in_app_notified']
        read_only_fields = ['signed', 'signed_at', 'notified_at', 'reminder_count', 'in_app_notified']

class EnvelopeSerializer(serializers.ModelSerializer):
    recipients = EnvelopeRecipientSerializer(many=True, required=False)
    fields = SigningFieldSerializer(many=True, required=False)
    document_file = serializers.FileField(write_only=True)
    document_url = serializers.URLField(source='document_file.url', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = Envelope
        fields = ['id', 'title', 'description', 'document_file', 'document_url', 'created_by', 'created_by_name',
                  'created_at', 'updated_at', 'status', 'flow_type', 'recipients', 'fields',
                  'reminder_days', 'deadline_at', 'hash_original', 'version', 'file_size',
                  'file_type', 'completion_rate', 'jwt_token', 'expires_at']
        read_only_fields = ['hash_original', 'version', 'created_by', 'created_at', 'updated_at',
                            'file_size', 'file_type', 'document_url', 'completion_rate']
    def get_created_by_name(self, obj):
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username

    def validate_document_file(self, value):
        if not value or not value.size:
            logger.error(f"File upload failed: empty file")
            raise serializers.ValidationError('Le fichier soumis est vide.')
        
        try:
            value.seek(0)
            content = value.read()
            value.seek(0)
            logger.debug(f"Validating file: name={value.name}, size={len(content)}")
            ext = value.name.split('.')[-1].lower() if '.' in value.name else ''
            if ext not in ['pdf', 'docx', 'doc']:
                raise serializers.ValidationError(f'Type de fichier non autorisé: {ext}')
            if len(content) > 10 * 1024 * 1024:
                raise serializers.ValidationError('Fichier trop volumineux (max 10MB)')
            if ext == 'pdf':
                if not content.startswith(b'%PDF-'):
                    raise serializers.ValidationError('Le fichier PDF est corrompu ou invalide.')
                try:
                    pdf = PdfReader(io.BytesIO(content))
                    if len(pdf.pages) == 0:
                        raise serializers.ValidationError('Le PDF est vide.')
                    logger.debug(f"PDF validation successful: {len(pdf.pages)} pages")
                except Exception as pdf_error:
                    logger.error(f"PDF validation error: {str(pdf_error)}")
                    raise serializers.ValidationError('Le fichier PDF est corrompu ou invalide.')
            value.seek(0)
        except serializers.ValidationError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error validating file: {str(e)}")
            raise serializers.ValidationError(f'Erreur de validation du fichier: {str(e)}')
        return value

    def create(self, validated_data):
        recipients_data = validated_data.pop('recipients', [])
        fields_data     = validated_data.pop('fields', [])
        user            = self.context['request'].user
        validated_data['created_by'] = user

        with transaction.atomic():
            envelope = Envelope.objects.create(**validated_data)
            recipient_map = {}

            for rec in recipients_data:
                # → lookup par email (prioritaire)
                email = rec.get('email', '').strip().lower()
                try:
                    usr = User.objects.get(email=email)
                    rec['user']        = usr
                    rec.setdefault('full_name', usr.get_full_name())
                except (User.DoesNotExist, ValueError):
                    # si pas de correspondance, on laisse user à None
                    pass

                recipient = EnvelopeRecipient.objects.create(envelope=envelope, **rec)
                recipient_map[recipient.order] = recipient

            for field in fields_data:
                order = field.pop('recipient_id', None)
                recipient = recipient_map.get(order)
                if recipient:
                    SigningField.objects.create(
                        envelope=envelope,
                        recipient=recipient,
                        **field
                    )

            return envelope

    def update(self, instance, validated_data):
        recipients_data = validated_data.pop('recipients', None)
        fields_data     = validated_data.pop('fields', None)

        # mise à jour des attributs de l'enveloppe
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if recipients_data is not None:
            # map id ➔ objet existant
            existing = {r.id: r for r in instance.recipients.all()}
            provided_ids = []

            with transaction.atomic():
                for rec in recipients_data:
                    # idem lookup par email quand on crée un nouveau
                    if not rec.get('id'):
                        email = rec.get('email', '').strip().lower()
                        try:
                            usr = User.objects.get(email=email)
                            rec['user']        = usr
                            rec.setdefault('full_name', usr.get_full_name())
                        except (User.DoesNotExist, ValueError):
                            pass

                    rec_id = rec.get('id')
                    if rec_id and rec_id in existing:
                        obj = existing[rec_id]
                        for k, v in rec.items():
                            setattr(obj, k, v)
                        obj.save()
                        provided_ids.append(rec_id)
                    else:
                        obj = EnvelopeRecipient.objects.create(
                            envelope=instance, **rec
                        )
                        provided_ids.append(obj.id)

                # suppression des non fournis
                for rid, obj in existing.items():
                    if rid not in provided_ids:
                        obj.delete()

        if fields_data is not None:
            existing = {f.id: f for f in instance.fields.all()}
            provided = []
            # on a besoin de l'ordre ➔ recipient map
            rec_map = {r.order: r for r in instance.recipients.all()}

            with transaction.atomic():
                for fld in fields_data:
                    field_id = fld.get('id')
                    order    = fld.pop('recipient_id', None)
                    recipient = rec_map.get(order)
                    if not recipient:
                        continue

                    if field_id and field_id in existing:
                        obj = existing[field_id]
                        for k, v in fld.items():
                            setattr(obj, k, v)
                        obj.recipient = recipient
                        obj.save()
                        provided.append(field_id)
                    else:
                        obj = SigningField.objects.create(
                            envelope=instance,
                            recipient=recipient,
                            **fld
                        )
                        provided.append(obj.id)

                for fid, obj in existing.items():
                    if fid not in provided:
                        obj.delete()

        return instance
class EnvelopeListSerializer(serializers.ModelSerializer):
    recipients_count = serializers.IntegerField(source='recipients.count', read_only=True)
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = Envelope
        fields = ['id', 'title', 'status', 'initiateur', 'created_at', 'deadline_at',
                  'recipients_count', 'completion_rate', 'flow_type']

 


class SignatureDocumentSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source='recipient.full_name', read_only=True)

    class Meta:
        model = SignatureDocument
        fields = ['id', 'envelope', 'recipient', 'recipient_name', 'signer', 'is_guest',
                  'signature_data', 'signed_fields', 'signed_file', 'signed_at',
                  'ip_address', 'user_agent', 'certificate_data']
        read_only_fields = ['signed_at', 'ip_address', 'user_agent', 'certificate_data']

class PrintQRCodeSerializer(serializers.ModelSerializer):
    envelope_title = serializers.CharField(source='envelope.title', read_only=True)
    is_valid = serializers.ReadOnlyField()

    class Meta:
        model = PrintQRCode
        fields = ['uuid', 'envelope', 'envelope_title', 'qr_type', 'state', 'created_at',
                  'scanned_at', 'expires_at', 'is_valid']
        read_only_fields = ['uuid', 'hmac', 'state', 'created_at', 'scanned_at']