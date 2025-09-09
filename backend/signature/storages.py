
# ===============================================
# signature/storages.py  
# Envelope encryption v2 : EG2 + KMS + AAD doc_uuid + size() sans déchiffrage
# ===============================================
import os, io, uuid, struct, logging,base64
from typing import Optional
from django.core.files.storage import FileSystemStorage
from django.core.files.base import ContentFile, File
from django.core.exceptions import ValidationError
from django.conf import settings
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidTag
from .kms import get_kms_client

logger = logging.getLogger(__name__)
# constants pratiques
_EG2_FIXED_MIN = 3 + 1 + 1 + 1 + 2 + 2 + 12 + 16  # = 39
_EG1_FIXED     = 3 + 1 + 12 + 16                  # = 32

# --- Petit wrapper pour injecter l'AAD depuis l'appelant (modèles / vues) ---
class AADContentFile(ContentFile):
    def __init__(self, content: bytes, aad: bytes, name: str | None = None):
        super().__init__(content, name=name)
        # lu par le storage au _save
        self._encryption_aad = bytes(aad)


def _get_aad_from_content(content: File, fallback_name: str) -> tuple[int, bytes]:
    """
    Retourne (aad_type, aad_value_bytes).
    - 1 => UUID binaire (16o)
    - 0 => nom de fichier UTF-8 (variable)
    Si l'appelant a fourni un attribut _encryption_aad (bytes de 16o), on l'utilise.
    Sinon, on retombe sur le nom du fichier (compatibilité).
    """
    aad = getattr(content, "_encryption_aad", None)
    if isinstance(aad, (bytes, bytearray)) and len(aad) == 16:
        return 1, bytes(aad)
    return 0, fallback_name.encode("utf-8", "surrogatepass")


class EncryptedFileSystemStorage(FileSystemStorage):
    """
    Chiffrement *par enveloppe* v2
      - DEK aléatoire par fichier (AES-256-GCM)
      - DEK *wrap* via KMS (RSA-OAEP par défaut)
      - AAD = doc_uuid (si fourni) OU nom du fichier
    En-tête EG2 auto-descriptif :
      magic 'EG2'(3) | ver(1) | key_id(1) | aad_type(1) | aad_len(2) | wlen(2) | iv(12) | tag(16) | aad | wrapped | ciphertext
    """

    MAGIC = b"EG2"
    VERSION = 2

    def _pack_header(self, *, key_id: int, aad_type: int, aad: bytes, iv: bytes, tag: bytes, wrapped: bytes) -> bytes:
        if not (0 <= key_id <= 255):
            raise ValueError("key_id must fit in 1 byte")
        if aad_type not in (0, 1):
            raise ValueError("aad_type must be 0(name) or 1(uuid)")
        aad_len = len(aad)
        wlen = len(wrapped)
        fixed = struct.pack(
            ">3sBBBBHH12s16s",
            self.MAGIC, self.VERSION, key_id, aad_type, (aad_len & 0xFF), (wlen & 0xFFFF), 0, iv, tag,
        )
        # Note: ci-dessus H(2) H(2) -> on utilise seulement le 2e pour wlen, le 1er est réservé (compat futur)
        return fixed + aad + wrapped

    def _unpack_header(self, blob: bytes):
        # Format EG2:
        # magic 'EG2'(3) | ver(1) | key_id(1) | aad_type(1) | aad_len(1) | wlen(2) | reserved(2) | iv(12) | tag(16)
        fmt = ">3sBBBBHH12s16s"
        fixed_len = struct.calcsize(fmt)  # = 39
        if len(blob) < fixed_len:
            raise ValueError("Encrypted blob too small for EG2 header")
    
        magic, ver, key_id, aad_type, aad_len, wlen, _reserved, iv, tag = struct.unpack(fmt, blob[:fixed_len])
        if magic != self.MAGIC or ver != self.VERSION:
            raise ValueError("Unsupported encrypted blob version")
    
        off = fixed_len
        if len(blob) < off + aad_len + wlen:
            raise ValueError("EG2 header declares more bytes than available")
    
        aad = blob[off:off + aad_len]
        off += aad_len
    
        wrapped = blob[off:off + wlen]
        off += wlen
    
        return key_id, aad_type, aad, iv, tag, wrapped, off
    

    def _save(self, name, content):
        kms = get_kms_client()
        valid_name = self.get_valid_name(name)
        final_name = self.get_available_name(valid_name)

        # --- Assurer qu'on peut lire depuis le début, même si le fichier a été fermé en amont
        def _rewind_or_reopen(f):
            try:
                if hasattr(f, "seek"):
                    f.seek(0)
                    return
            except ValueError:
                # Fichier fermé → tenter de le rouvrir
                logger.error(
                    "Flux fermé lors de la tentative de repositionnement ; tentative de réouverture",
                    exc_info=True,
                )
            # Essayer d'ouvrir sur l'objet lui-même…
            if hasattr(f, "open"):
                try:
                    f.open("rb")
                    if hasattr(f, "seek"):
                        f.seek(0)
                        return
                except Exception:
                    logger.error(
                        "Erreur lors de la réouverture du fichier source",
                        exc_info=True,
                    )
            inner = getattr(f, "file", None)
            if inner and hasattr(inner, "open"):
                inner.open("rb")
                if hasattr(f, "seek"):
                    f.seek(0)
                    return
            raise ValidationError("Impossible d'ouvrir le fichier source pour chiffrement (flux fermé).")

        _rewind_or_reopen(content)
        chunk_size = 1024 * 1024  # 1 Mo
        first_chunk = True
        ciphertext = bytearray()

        # Générer DEK & IV
        dek = os.urandom(32)
        iv = os.urandom(12)
        cipher = Cipher(algorithms.AES(dek), modes.GCM(iv), backend=default_backend())
        enc = cipher.encryptor()

        # AAD : doc_uuid binaire (16o) si fourni par l'appelant, sinon le nom final
        aad_type, aad_value = _get_aad_from_content(content, final_name)
        enc.authenticate_additional_data(aad_value)

        while True:
            chunk = content.read(chunk_size)
            if not chunk:
                break
            if first_chunk:
                # Validation basique PDF si extension .pdf
                if final_name.lower().endswith('.pdf') and not chunk.startswith(b'%PDF-'):
                    raise ValidationError("Le fichier n'est pas un PDF valide.")
                first_chunk = False
            ciphertext.extend(enc.update(chunk))

        if first_chunk:
            raise ValidationError("Le fichier est vide.")

        ciphertext.extend(enc.finalize())
        tag = enc.tag

        ciphertext = bytes(ciphertext)

        # Wrap DEK avec KMS
        key_id, wrapped = kms.wrap_key(dek)

        # Assembler l'en-tête v2
        header = self._pack_header(key_id=key_id, aad_type=aad_type, aad=aad_value, iv=iv, tag=tag, wrapped=wrapped)

        cf = ContentFile(header + ciphertext)
        cf.name = final_name
        saved = super()._save(final_name, cf)
        logger.info(f"Encrypted {saved} (EG2/KMS, aad_type={aad_type}, kid={key_id})")
        return saved

    # --- NOUVEAU : helpers de détection ---
    @staticmethod
    def _magic(blob: bytes) -> bytes:
        return blob[:3] if len(blob) >= 3 else b""

    @staticmethod
    def _is_plain_pdf(blob: bytes) -> bool:
        return blob.startswith(b"%PDF-")

    # --- NOUVEAU : lecture legacy EG1 (clé globale base64) ---
    def _open_eg1(self, name: str, blob: bytes) -> io.BytesIO:
        if len(blob) < _EG1_FIXED:
            raise ValueError("Blob trop petit pour en-tête EG1")

        # EG1 layout: b'EG1' | key_id(1) | iv(12) | tag(16) | ciphertext
        if not blob.startswith(b"EG1"):
            raise ValueError("En-tête EG1 attendu")

        key_id = blob[3]
        iv  = blob[4:4+12]
        tag = blob[16:16+16]
        ciphertext = blob[_EG1_FIXED:]

        # Récupérer la clé legacy
        b64 = getattr(settings, "FILE_ENCRYPTION_KEY_B64", None)
        if not b64:
            raise ValueError(
                "Fichier au format legacy (EG1) détecté mais "
                "FILE_ENCRYPTION_KEY_B64 n'est pas défini. "
                "Renseigne la clé v1 (base64) pour permettre la lecture/migration."
            )
        try:
            dek = base64.b64decode(b64)
            if len(dek) not in (16, 24, 32):
                raise ValueError("Clé legacy invalide (taille attendue 16/24/32 octets)")
        except Exception as e:
            raise ValueError(f"Clé legacy illisible: {e}")

        # AAD legacy = nom du fichier (v1)
        aad = name.encode("utf-8", "surrogatepass")

        cipher = Cipher(algorithms.AES(dek), modes.GCM(iv, tag), backend=default_backend())
        dec = cipher.decryptor()
        dec.authenticate_additional_data(aad)
        try:
            plaintext = dec.update(ciphertext) + dec.finalize()
        except InvalidTag:
            raise ValueError("Tag GCM invalide (legacy EG1): clé/AAD/iv incorrects ou fichier corrompu")

        # Optionnel : vérifier PDF
        if name.lower().endswith(".pdf") and not plaintext.startswith(b"%PDF-"):
            raise ValueError("Le fichier déchiffré (EG1) n'est pas un PDF valide.")

        bio = io.BytesIO(plaintext)
        bio.name = name
        bio.size = len(plaintext)
        return bio

    # --- MODIFIER open() pour sniffer et router ---
    def open(self, name, mode='rb'):
        """
        Ouvre un fichier chiffré.
        - EG2 (v2): envelope + KMS (wrapped DEK), AAD = doc_uuid/nom
        - EG1 (legacy): clé globale base64 (settings.FILE_ENCRYPTION_KEY_B64), AAD = nom
        - PDF en clair: servi tel quel (utile pendant migration)
        """
        
    
        with super().open(name, mode) as f:
            blob = f.read()
    
        try:
            # --- sniff du format ---
            magic = blob[:3] if len(blob) >= 3 else b""
    
            # ---------- EG2 (actuel) ----------
            if magic == b"EG2":
                # longueur fixe de l'entête EG2 (évite les erreurs d'octets)
                eg2_fixed_len = struct.calcsize(">3sBBBBHH12s16s")  # = 39
                if len(blob) < eg2_fixed_len:
                    raise ValueError("Blob trop petit pour en-tête EG2")
    
                key_id, aad_type, aad, iv, tag, wrapped, off = self._unpack_header(blob)
                ciphertext = blob[off:]
    
                # unwrap DEK via KMS
                kms = get_kms_client()
                dek = kms.unwrap_key(key_id, wrapped)
    
                cipher = Cipher(algorithms.AES(dek), modes.GCM(iv, tag), backend=default_backend())
                dec = cipher.decryptor()
                dec.authenticate_additional_data(aad)
                plaintext = dec.update(ciphertext) + dec.finalize()
    
                # Validation PDF optionnelle
                if name.lower().endswith('.pdf') and not plaintext.startswith(b'%PDF-'):
                    raise ValueError("Le fichier déchiffré n'est pas un PDF valide.")
    
                bio = io.BytesIO(plaintext)
                bio.name = name
                bio.size = len(plaintext)
                return bio
    
            # ---------- EG1 (legacy) ----------
            elif magic == b"EG1":
                eg1_fixed_len = 3 + 1 + 12 + 16  # 32
                if len(blob) < eg1_fixed_len:
                    raise ValueError("Blob trop petit pour en-tête EG1")
    
                # EG1 layout: b'EG1' | key_id(1) | iv(12) | tag(16) | ciphertext
                key_id_legacy = blob[3]
                iv = blob[4:4 + 12]
                tag = blob[16:16 + 16]
                ciphertext = blob[eg1_fixed_len:]
    
                b64 = getattr(settings, "FILE_ENCRYPTION_KEY_B64", None)
                if not b64:
                    raise ValueError(
                        "Fichier au format legacy (EG1) détecté mais "
                        "FILE_ENCRYPTION_KEY_B64 n'est pas défini. "
                        "Renseigne la clé v1 (base64) pour permettre la lecture/migration."
                    )
                try:
                    dek = base64.b64decode(b64)
                    if len(dek) not in (16, 24, 32):
                        raise ValueError("Clé legacy invalide (taille 16/24/32 attendue)")
                except Exception as e:
                    raise ValueError(f"Clé legacy illisible: {e}")
    
                # AAD v1 = nom du fichier
                aad_legacy = name.encode("utf-8", "surrogatepass")
    
                cipher = Cipher(algorithms.AES(dek), modes.GCM(iv, tag), backend=default_backend())
                dec = cipher.decryptor()
                dec.authenticate_additional_data(aad_legacy)
                plaintext = dec.update(ciphertext) + dec.finalize()
    
                if name.lower().endswith('.pdf') and not plaintext.startswith(b'%PDF-'):
                    raise ValueError("Le fichier déchiffré (EG1) n'est pas un PDF valide.")
    
                bio = io.BytesIO(plaintext)
                bio.name = name
                bio.size = len(plaintext)
                return bio
    
            # ---------- PDF en clair (avant chiffrement) ----------
            elif blob.startswith(b'%PDF-'):
                logger.warning("Plain PDF detected for %s; serving as-is (considère une migration vers EG2)", name)
                bio = io.BytesIO(blob)
                bio.name = name
                bio.size = len(blob)
                return bio
    
            # ---------- Inconnu ----------
            else:
                raise ValueError("Format de fichier inconnu (ni EG2, ni EG1, ni PDF)")
    
        except InvalidTag:
            logger.exception("Invalid GCM tag for %s", name)
            raise ValueError("Le fichier chiffré est corrompu ou le tag est invalide.")
        except Exception:
            logger.exception("Error opening %s", name)
            raise

    # --- MODIFIER size() pour gérer EG2/EG1/plain ---
    def size(self, name):
        path = self.path(name)
        enc_size = os.path.getsize(path)
        with open(path, 'rb') as f:
            head = f.read(max(_EG2_FIXED_MIN, 5))  # 5 suffit pour '%PDF-'

        m = self._magic(head)
        if m == b"EG2":
            # Relire l'en-tête complet selon les longueurs déclarées
            with open(path, 'rb') as f:
                fixed = f.read(_EG2_FIXED_MIN)
                # on ne peut pas connaître aad_len/wlen sans parser -> réutiliser _unpack_header
                # astuce: lire un peu plus puis ré-appeler _unpack_header
                more = f.read(4096)
                _, _, _, _, _, _, off_guess = self._unpack_header(fixed + more)
                # S'il manque, relire exactement off_guess
                with open(path, 'rb') as f2:
                    full = f2.read(off_guess)
                _, _, _, _, _, _, off_exact = self._unpack_header(full)
                return enc_size - off_exact

        elif m == b"EG1":
            return max(0, enc_size - _EG1_FIXED)

        elif self._is_plain_pdf(head):
            return enc_size

        # inconnu → taille brute (fallback conservateur)
        return enc_size
