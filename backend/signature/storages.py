# storages.py - Version améliorée avec meilleure gestion d'erreurs
import os
from django.core.files.storage import FileSystemStorage
from django.core.files.base import ContentFile
from django.conf import settings
from django.core.exceptions import ValidationError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidTag
import logging
import io

logger = logging.getLogger(__name__)

class EncryptedFileSystemStorage(FileSystemStorage):
    """
    Storage qui chiffre en AES-256-GCM tous les fichiers avant de les écrire,
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
            # Ensure we're at the beginning of the file
            if hasattr(content, 'seek'):
                content.seek(0)
            
            # Read the entire file content into memory
            if hasattr(content, 'read'):
                data = content.read()
            else:
                data = content
                
            if not data:
                logger.error(f"File {name} is empty")
                raise ValidationError("Le fichier est vide.")
                
            logger.debug(f"Saving file {name}: {len(data)} bytes")
            
            # Vérifier si c'est un PDF
            if name.lower().endswith('.pdf') and not data.startswith(b'%PDF-'):
                logger.error(f"File {name} is not a valid PDF")
                raise ValidationError("Le fichier n'est pas un PDF valide.")
            
            # Generate IV and encrypt (AES-GCM)
            iv = os.urandom(12)
            cipher = Cipher(
                algorithms.AES(self.key),
                modes.GCM(iv),
                backend=default_backend(),
            )
            encryptor = cipher.encryptor()
            encrypted = encryptor.update(data) + encryptor.finalize()
            tag = encryptor.tag

            # Save IV + tag + encrypted data
            encrypted_content = ContentFile(iv + tag + encrypted)
            encrypted_content.name = name
            saved_name = super()._save(name, encrypted_content)
            logger.info(f"File {saved_name} saved and encrypted successfully ({len(data)} bytes)")
            return saved_name
        except Exception as e:
            logger.error(f"Error saving file {name}: {str(e)}")
            raise

    def open(self, name, mode='rb'):
        try:
            # Read encrypted file
            with super().open(name, mode) as f:
                data = f.read()

            if len(data) < 28:
                logger.error(f"File {name} too short to contain IV and tag (size: {len(data)})")
                raise ValueError(
                    f"File too short to contain IV and tag (size: {len(data)})"
                )

            # Split IV, tag and ciphertext
            iv = data[:12]
            tag = data[12:28]
            encrypted = data[28:]
            logger.debug(
                f"Opening file {name}: total size={len(data)}, IV length={len(iv)}, tag length={len(tag)}, encrypted length={len(encrypted)}"
            )

            # Decrypt and verify tag
            cipher = Cipher(
                algorithms.AES(self.key),
                modes.GCM(iv, tag),
                backend=default_backend(),
            )
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(encrypted) + decryptor.finalize()
            logger.debug(f"File {name} decrypted: {len(decrypted)} bytes")
            
            # Vérifier si c'est un PDF
            if name.lower().endswith('.pdf') and not decrypted.startswith(b'%PDF-'):
                logger.error(f"Decrypted file {name} is not a valid PDF. First 10 bytes: {decrypted[:10]}")
                raise ValueError("Le fichier déchiffré n'est pas un PDF valide.")
            
            # Create a file-like object that can be seeked
            decrypted_io = io.BytesIO(decrypted)
            decrypted_io.name = name
            decrypted_io.size = len(decrypted)
            return decrypted_io
        except InvalidTag:
            logger.error(f"Invalid authentication tag for file {name}")
            raise ValueError("Le fichier chiffré est corrompu ou le tag est invalide.")
        except Exception as e:
            logger.error(f"Error opening file {name}: {str(e)}")
            raise

    def size(self, name):
        try:
            # Open file to get decrypted size
            with self.open(name, 'rb') as f:
                f.seek(0, 2)  # Seek to end
                size = f.tell()
                f.seek(0)  # Reset to beginning
            return size
        except Exception as e:
            logger.error(f"Error getting size of file {name}: {str(e)}")
            raise

    def url(self, name):
        # Return the standard URL - the decryption will be handled by the view
        return super().url(name)

