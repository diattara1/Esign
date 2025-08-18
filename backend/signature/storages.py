# storages.py - Version améliorée avec meilleure gestion d'erreurs
import os
import io
import logging
from django.core.files.storage import FileSystemStorage
from django.core.files.base import File
from django.conf import settings
from django.core.exceptions import ValidationError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

class _ChunkedIteratorIO(io.RawIOBase):
    def __init__(self, iterator):
        self.iterator = iter(iterator)
        self.buffer = b""

    def readable(self):
        return True

    def read(self, n=-1):
        if n == -1:
            chunks = [self.buffer]
            chunks.extend(self.iterator)
            self.buffer = b""
            return b"".join(chunks)
        while len(self.buffer) < n:
            try:
                self.buffer += next(self.iterator)
            except StopIteration:
                break
        result, self.buffer = self.buffer[:n], self.buffer[n:]
        return result

class EncryptedFileSystemStorage(FileSystemStorage):
    """
    Storage qui chiffre en AES-256-CFB tous les fichiers avant de les écrire,
    et les déchiffre à la lecture.
    """
    def __init__(self, *args, **kwargs):
        if not hasattr(settings, 'FILE_ENCRYPTION_KEY') or len(settings.FILE_ENCRYPTION_KEY) != 32:
            logger.error("FILE_ENCRYPTION_KEY must be a 32-byte key")
            raise ValueError("FILE_ENCRYPTION_KEY must be a 32-byte key")
        self.key = settings.FILE_ENCRYPTION_KEY
        super().__init__(*args, **kwargs)

    def _save(self, name, content):
        try:
            if hasattr(content, "seek"):
                content.seek(0)

            chunks = content.chunks()
            try:
                first_chunk = next(chunks)
            except StopIteration:
                logger.error(f"File {name} is empty")
                raise ValidationError("Le fichier est vide.")

            if name.lower().endswith(".pdf") and not first_chunk.startswith(b"%PDF-"):
                logger.error(f"File {name} is not a valid PDF")
                raise ValidationError("Le fichier n'est pas un PDF valide.")

            iv = os.urandom(16)
            cipher = Cipher(algorithms.AES(self.key), modes.CFB(iv), backend=default_backend())
            encryptor = cipher.encryptor()

            def gen():
                yield iv
                yield encryptor.update(first_chunk)
                for chunk in chunks:
                    if chunk:
                        yield encryptor.update(chunk)
                yield encryptor.finalize()

            encrypted_content = File(_ChunkedIteratorIO(gen()), name)
            saved_name = super()._save(name, encrypted_content)
            logger.info(f"File {saved_name} saved and encrypted successfully")
            return saved_name
        except Exception as e:
            logger.error(f"Error saving file {name}: {str(e)}")
            raise

    def open(self, name, mode='rb'):
        try:
            f = super().open(name, mode)
            iv = f.read(16)
            if len(iv) != 16:
                f.close()
                logger.error(f"File {name} too short to contain IV (size: {len(iv)})")
                raise ValueError(f"File too short to contain IV (size: {len(iv)})")

            cipher = Cipher(algorithms.AES(self.key), modes.CFB(iv), backend=default_backend())
            decryptor = cipher.decryptor()

            def gen():
                first = True
                try:
                    for chunk in iter(lambda: f.read(64 * 1024), b""):
                        decrypted_chunk = decryptor.update(chunk)
                        if first:
                            first = False
                            if name.lower().endswith('.pdf') and not decrypted_chunk.startswith(b'%PDF-'):
                                logger.error(f"Decrypted file {name} is not a valid PDF. First 10 bytes: {decrypted_chunk[:10]}")
                                raise ValueError("Le fichier déchiffré n'est pas un PDF valide.")
                        yield decrypted_chunk
                    final_chunk = decryptor.finalize()
                    if first and not final_chunk:
                        logger.error(f"File {name} is empty after decryption")
                        raise ValueError("Le fichier est vide.")
                    if final_chunk:
                        yield final_chunk
                finally:
                    f.close()

            return File(_ChunkedIteratorIO(gen()), name)
        except Exception as e:
            logger.error(f"Error opening file {name}: {str(e)}")
            raise

    def size(self, name):
        try:
            with super().open(name, 'rb') as f:
                iv = f.read(16)
                if len(iv) != 16:
                    logger.error(f"File {name} too short to contain IV (size: {len(iv)})")
                    raise ValueError(f"File too short to contain IV (size: {len(iv)})")

                cipher = Cipher(algorithms.AES(self.key), modes.CFB(iv), backend=default_backend())
                decryptor = cipher.decryptor()
                total = 0
                for chunk in iter(lambda: f.read(64 * 1024), b""):
                    total += len(decryptor.update(chunk))
                decryptor.finalize()
            return total
        except Exception as e:
            logger.error(f"Error getting size of file {name}: {str(e)}")
            raise

    def url(self, name):
        # Return the standard URL - the decryption will be handled by the view
        return super().url(name)