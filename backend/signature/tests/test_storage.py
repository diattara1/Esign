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

from django.core.files.base import ContentFile
from django.test import SimpleTestCase
from signature.storages import EncryptedFileSystemStorage


class LargeFileEncryptionTest(SimpleTestCase):
    def test_large_pdf_encryption(self):
        storage = EncryptedFileSystemStorage()
        data = b'%PDF-1.4\n' + os.urandom(2 * 1024 * 1024)  # 2 Mo
        cf = ContentFile(data, name='big.pdf')
        name = storage.save('big.pdf', cf)
        self.assertTrue(storage.exists(name))
        with storage.open(name) as f:
            decrypted = f.read()
        self.assertEqual(decrypted[:5], b'%PDF-')
        self.assertEqual(len(decrypted), len(data))
