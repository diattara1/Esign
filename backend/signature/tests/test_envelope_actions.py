import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import override_settings
from django.urls import reverse
from reportlab.pdfgen import canvas
from rest_framework import status
from rest_framework.test import APITestCase, APIRequestFactory
from unittest import mock
from pathlib import Path

from signature.models import (
    Envelope,
    EnvelopeDocument,
    EnvelopeRecipient,
    SignatureDocument,
)
from signature.views.envelope import EnvelopeViewSet


class EnvelopeActionTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.temp_media = tempfile.mkdtemp()
        base_dir = Path(__file__).resolve().parents[2]
        override = override_settings(
            MEDIA_ROOT=self.temp_media,
            DEBUG=True,
            SECURE_SSL_REDIRECT=False,
            KMS_ACTIVE_KEY_ID=1,
            KMS_RSA_PUBLIC_KEYS={"1": str(base_dir / "certs" / "kms_pub_1.pem")},
            KMS_RSA_PRIVATE_KEYS={"1": str(base_dir / "certs" / "kms_priv_1.pem")},
        )
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

    @staticmethod
    def _pdf_with_label(name: str, label: str) -> ContentFile:
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=(200, 200))
        c.drawString(40, 120, label)
        c.showPage()
        c.save()
        buffer.seek(0)
        return ContentFile(buffer.read(), name=name)

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

    def test_do_sign_handles_multiple_documents(self):
        envelope = Envelope.objects.create(
            title="Multi", created_by=self.creator, status="sent"
        )
        doc1 = EnvelopeDocument.objects.create(
            envelope=envelope,
            file=self._pdf_with_label("doc1.pdf", "DOC1"),
        )
        doc2 = EnvelopeDocument.objects.create(
            envelope=envelope,
            file=self._pdf_with_label("doc2.pdf", "DOC2"),
        )

        recipient = EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=self.creator,
            email="creator@example.com",
            full_name="Creator",
            order=1,
        )

        factory = APIRequestFactory()
        request = factory.post("/fake")
        request.user = self.creator
        request.META.setdefault("REMOTE_ADDR", "127.0.0.1")
        request.META.setdefault("HTTP_USER_AGENT", "test-suite")

        view = EnvelopeViewSet()
        view.request = request

        sig_image = "data:image/png;base64," + (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
        )

        field1_id = "field-1"
        field2_id = "field-2"
        signed_fields = {
            field1_id: {
                "id": field1_id,
                "recipient_id": recipient.id,
                "document_id": doc1.id,
                "page": 1,
                "position": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.15},
            },
            field2_id: {
                "id": field2_id,
                "recipient_id": recipient.id,
                "document_id": doc2.id,
                "page": 1,
                "position": {"x": 0.6, "y": 0.4, "width": 0.25, "height": 0.15},
            },
        }
        signature_data = {
            field1_id: sig_image,
            field2_id: sig_image,
        }

        with mock.patch.object(
            EnvelopeViewSet,
            "_add_signature_overlay_to_pdf",
            autospec=True,
        ) as overlay_mock, mock.patch(
            "signature.views.envelope.sign_pdf_bytes"
        ) as sign_mock:
            overlay_mock.side_effect = (
                lambda _self, pdf, *_args, **_kwargs: pdf
            )
            sign_mock.side_effect = lambda pdf, **_kwargs: pdf

            response = view._do_sign(envelope, recipient, signature_data, signed_fields)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sig_doc = SignatureDocument.objects.filter(envelope=envelope, recipient=recipient).latest("signed_at")
        self.assertTrue(sig_doc.signed_file)

        overlay_pages = [call.args[7] for call in overlay_mock.call_args_list]
        sign_pages = [call.kwargs.get("page_ix") for call in sign_mock.call_args_list]

        self.assertEqual(overlay_pages, [0, 1])
        self.assertEqual(sign_pages, [0, 1])
