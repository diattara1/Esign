import os
import tempfile
from pathlib import Path

from django.conf import settings

# Configure minimal settings if not already configured
BASE_DIR = Path(__file__).resolve().parents[2]
if not settings.configured:
    settings.configure(
        BASE_DIR=BASE_DIR,
        DEFAULT_FILE_STORAGE='signature.storages.EncryptedFileSystemStorage',
        MEDIA_ROOT=tempfile.mkdtemp(),
        INSTALLED_APPS=[],
        KMS_ACTIVE_KEY_ID=1,
        KMS_RSA_PUBLIC_KEYS={"1": str(BASE_DIR / 'certs' / 'kms_pub_1.pem')},
        KMS_RSA_PRIVATE_KEYS={"1": str(BASE_DIR / 'certs' / 'kms_priv_1.pem')},
    )
    import django
    django.setup()

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.test import SimpleTestCase, override_settings
from signature.storages import EncryptedFileSystemStorage


class LargeFileEncryptionTest(SimpleTestCase):
    def test_large_pdf_encryption(self):
        storage = EncryptedFileSystemStorage()
        data = b'%PDF-1.4\n' + os.urandom(2 * 1024 * 1024)  # 2 Mo
        cf = ContentFile(data, name='big.pdf')
        cf.content_type = 'application/pdf'
        name = storage.save('big.pdf', cf)
        self.assertTrue(storage.exists(name))
        with storage.open(name) as f:
            decrypted = f.read()
        self.assertEqual(decrypted[:5], b'%PDF-')
        self.assertEqual(len(decrypted), len(data))


class StorageValidationTest(SimpleTestCase):
    def setUp(self):
        self.storage = EncryptedFileSystemStorage()

    def _pdf(self, size=10):
        return b'%PDF-1.4\n' + (b'0' * size)

    def test_invalid_mime_type(self):
        cf = ContentFile(self._pdf(), name='doc.pdf')
        cf.content_type = 'text/plain'
        with self.assertRaises(ValidationError):
            self.storage.save('doc.pdf', cf)

    def test_invalid_extension(self):
        cf = ContentFile(self._pdf(), name='doc.txt')
        cf.content_type = 'application/pdf'
        with self.assertRaises(ValidationError):
            self.storage.save('doc.txt', cf)

    @override_settings(MAX_PDF_SIZE=1024)
    def test_reject_too_large_pdf(self):
        data = b'%PDF-1.4\n' + os.urandom(2048)
        cf = ContentFile(data, name='big.pdf')
        cf.content_type = 'application/pdf'
        with self.assertRaises(ValidationError):
            self.storage.save('big.pdf', cf)
