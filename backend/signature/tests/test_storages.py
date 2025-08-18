from django.test import SimpleTestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from signature.storages import EncryptedFileSystemStorage

@override_settings(FILE_ENCRYPTION_KEY=b'0' * 32)
class EncryptedStorageStreamingTest(SimpleTestCase):
    def test_large_file_roundtrip(self):
        storage = EncryptedFileSystemStorage(location=settings.MEDIA_ROOT)
        data = b'%PDF-1.4\n' + b'A' * (2 * 1024 * 1024)
        uploaded = SimpleUploadedFile('big.pdf', data, content_type='application/pdf')
        name = storage.save('big.pdf', uploaded)
        try:
            with storage.open(name, 'rb') as f:
                result = b''.join(f.chunks())
            self.assertEqual(result, data)
        finally:
            storage.delete(name)
