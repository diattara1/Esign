import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from signature.models import (
    Envelope,
    EnvelopeDocument,
    EnvelopeRecipient,
    SignatureDocument,
)


class EnvelopeActionTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.temp_media = tempfile.mkdtemp()
        override = override_settings(MEDIA_ROOT=self.temp_media)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(lambda: shutil.rmtree(self.temp_media, ignore_errors=True))

        User = get_user_model()
        self.creator = User.objects.create_user(
            username="creator",
            password="password",
            email="creator@example.com",
        )
        self.other_user = User.objects.create_user(
            username="other",
            password="password",
            email="other@example.com",
        )
        self.client.force_authenticate(user=self.creator)

    @staticmethod
    def _pdf_file(name: str = "document.pdf") -> ContentFile:
        content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF"
        return ContentFile(content, name=name)

    def test_restore_success(self):
        envelope = Envelope.objects.create(
            title="Doc",
            created_by=self.creator,
            status="cancelled",
        )

        url = reverse("envelopes-restore", kwargs={"pk": envelope.pk})
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"status": "draft"})

        envelope.refresh_from_db()
        self.assertEqual(envelope.status, "draft")

    def test_restore_requires_cancelled_status(self):
        envelope = Envelope.objects.create(
            title="Doc",
            created_by=self.creator,
            status="draft",
        )

        url = reverse("envelopes-restore", kwargs={"pk": envelope.pk})
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"], "Non annulé")

    def test_restore_forbidden_for_non_creator(self):
        envelope = Envelope.objects.create(
            title="Doc",
            created_by=self.creator,
            status="cancelled",
        )
        EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=self.other_user,
            email="other@example.com",
            full_name="Other",
        )

        self.client.force_authenticate(user=self.other_user)

        url = reverse("envelopes-restore", kwargs={"pk": envelope.pk})
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            response.data["error"],
            "Action réservée au créateur de l'enveloppe",
        )

    def test_purge_deletes_envelope_and_files(self):
        envelope = Envelope.objects.create(
            title="Doc",
            created_by=self.creator,
            status="cancelled",
        )
        envelope.document_file.save("original.pdf", self._pdf_file("original.pdf"))
        self.assertTrue(envelope.document_file.storage.exists(envelope.document_file.name))

        env_doc = EnvelopeDocument.objects.create(
            envelope=envelope,
            file=self._pdf_file("doc.pdf"),
        )
        self.assertTrue(env_doc.file.storage.exists(env_doc.file.name))

        recipient = EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=self.creator,
            email="creator@example.com",
            full_name="Creator",
        )
        signature_doc = SignatureDocument.objects.create(
            envelope=envelope,
            recipient=recipient,
            signer=self.creator,
            signature_data="{}",
        )
        signature_doc.signed_file.save("signed.pdf", self._pdf_file("signed.pdf"))
        self.assertTrue(signature_doc.signed_file.storage.exists(signature_doc.signed_file.name))

        original_path = envelope.document_file.name
        doc_path = env_doc.file.name
        signed_path = signature_doc.signed_file.name
        original_storage = envelope.document_file.storage
        doc_storage = env_doc.file.storage
        signed_storage = signature_doc.signed_file.storage

        url = reverse("envelopes-purge", kwargs={"pk": envelope.pk})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Envelope.objects.filter(pk=envelope.pk).exists())
        self.assertFalse(original_storage.exists(original_path))
        self.assertFalse(doc_storage.exists(doc_path))
        self.assertFalse(signed_storage.exists(signed_path))

    def test_purge_forbidden_for_non_creator(self):
        envelope = Envelope.objects.create(
            title="Doc",
            created_by=self.creator,
            status="cancelled",
        )
        EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=self.other_user,
            email="other@example.com",
            full_name="Other",
        )

        self.client.force_authenticate(user=self.other_user)

        url = reverse("envelopes-purge", kwargs={"pk": envelope.pk})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Envelope.objects.filter(pk=envelope.pk).exists())
