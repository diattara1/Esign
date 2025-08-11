from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.conf import settings
from .models import (
    Envelope,
    EnvelopeRecipient,
    SigningField,
    SignatureDocument,
    PrintQRCode,
    NotificationPreference,
    EnvelopeDocument,
)
from PyPDF2 import PdfReader
from django.db import transaction
import io
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'username', 'email', 'first_name', 'last_name',
            'birth_date', 'phone_number', 'gender', 'address', 'avatar'
        ]
        read_only_fields = ['username', 'email']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'first_name', 'last_name',
            'birth_date', 'phone_number', 'gender', 'address', 'avatar'
        ]


    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Cet e-mail est déjà utilisé.')
        return value


    def create(self, validated_data):
        avatar = validated_data.pop('avatar', None)
        user = User.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data.get('email'),
            password=validated_data.get('password'),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            birth_date=validated_data.get('birth_date'),
            phone_number=validated_data.get('phone_number', ''),
            gender=validated_data.get('gender', ''),
            address=validated_data.get('address', ''),
            is_active=False,
        )
        if avatar:
            user.avatar = avatar
            user.save()
        NotificationPreference.objects.create(user=user)
        return user


class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        if not User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Utilisateur introuvable')
        return value

    def save(self):
        request = self.context.get('request')
        email = self.validated_data['email']
        user = User.objects.get(email=email)
        token = default_token_generator.make_token(user)
        reset_link = request.build_absolute_uri(
            f"/reset-password/{user.pk}/{token}/"
        )
        send_mail(
            'Réinitialisation de mot de passe',
            f'Utilisez ce lien pour réinitialiser votre mot de passe : {reset_link}',
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=True,
        )


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ['id', 'email', 'sms', 'push']
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


class EnvelopeDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.URLField(source='file.url', read_only=True)
    file = serializers.FileField(write_only=True)

    class Meta:
        model = EnvelopeDocument
        fields = ['id', 'file', 'file_url', 'name', 'file_type', 'file_size', 'hash_original', 'version']
        read_only_fields = ['file_url', 'file_type', 'file_size', 'hash_original', 'version', 'name']


class EnvelopeRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvelopeRecipient
        fields = ['id', 'email', 'full_name', 'order', 'signed', 'signed_at', 'notified_at', 'reminder_count', 'in_app_notified']
        read_only_fields = ['signed', 'signed_at', 'notified_at', 'reminder_count', 'in_app_notified']


class EnvelopeSerializer(serializers.ModelSerializer):
    recipients = EnvelopeRecipientSerializer(many=True, required=False)
    fields = SigningFieldSerializer(many=True, required=False)
    files = serializers.ListField(child=serializers.FileField(), write_only=True, required=False)
    documents = EnvelopeDocumentSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = Envelope
        fields = ['id', 'title', 'description', 'files', 'documents', 'created_by', 'created_by_name',
                  'created_at', 'updated_at', 'status', 'flow_type', 'recipients', 'fields',
                  'reminder_days', 'deadline_at', 'hash_original', 'version', 'file_size',
                  'file_type', 'completion_rate', 'jwt_token', 'expires_at']
        read_only_fields = ['hash_original', 'version', 'created_by', 'created_at', 'updated_at',
                            'file_size', 'file_type', 'completion_rate']

    def get_created_by_name(self, obj):
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username

    def create(self, validated_data):
        recipients_data = validated_data.pop('recipients', [])
        fields_data = validated_data.pop('fields', [])
        files_data = validated_data.pop('files', [])
        user = self.context['request'].user
        validated_data['created_by'] = user

        with transaction.atomic():
            envelope = Envelope.objects.create(**validated_data)
            recipient_map = {}

            for rec in recipients_data:
                email = rec.get('email', '').strip().lower()
                try:
                    usr = User.objects.get(email=email)
                    rec['user'] = usr
                    rec.setdefault('full_name', usr.get_full_name())
                except (User.DoesNotExist, ValueError):
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

            for f in files_data:
                EnvelopeDocument.objects.create(envelope=envelope, file=f)

            return envelope

    def update(self, instance, validated_data):
        recipients_data = validated_data.pop('recipients', None)
        fields_data = validated_data.pop('fields', None)
        files_data = validated_data.pop('files', [])

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if files_data:
            for f in files_data:
                EnvelopeDocument.objects.create(envelope=instance, file=f)

        if recipients_data is not None:
            existing = {r.id: r for r in instance.recipients.all()}
            provided_ids = []

            with transaction.atomic():
                for rec in recipients_data:
                    if not rec.get('id'):
                        email = rec.get('email', '').strip().lower()
                        try:
                            usr = User.objects.get(email=email)
                            rec['user'] = usr
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

                for rid, obj in existing.items():
                    if rid not in provided_ids:
                        obj.delete()

        if fields_data is not None:
            existing = {f.id: f for f in instance.fields.all()}
            provided = []
            rec_map = {r.order: r for r in instance.recipients.all()}

            with transaction.atomic():
                for fld in fields_data:
                    field_id = fld.get('id')
                    order = fld.pop('recipient_id', None)
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