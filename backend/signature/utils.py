import io
import hashlib
import logging
from typing import BinaryIO
from django.conf import settings
from django.core.exceptions import ValidationError
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)
MAX_PDF_SIZE = getattr(settings, "MAX_PDF_SIZE", 10 * 1024 * 1024)


def _file_like(obj) -> BinaryIO:
    """
    Retourne un objet fichier binaire lisible depuis un FieldFile / UploadedFile / fileobj.
    N'ouvre pas en mode écriture. L'appelant gère la fermeture.
    """
    # Django FieldFile expose .open() / .file
    if hasattr(obj, "open"):
        obj.open("rb")
        return obj
    if hasattr(obj, "file"):
        return obj.file
    return obj  # déjà un file-like


def stream_hash(fileobj, *, chunk_size: int = 1024 * 1024, want_md5: bool = False):
    """
    Calcule SHA-256 (et optionnellement MD5) en **stream**.
    - Accepte FieldFile / UploadedFile / file-like.
    - Restaure la position du curseur.
    Retourne un dict : {"hash_sha256": "...", "hash_md5": "...?"}
    """
    sha = hashlib.sha256()
    md5 = hashlib.md5() if want_md5 else None

    f = _file_like(fileobj)
    # Sauver/Restaurer la position si possible
    pos = None
    try:
        if hasattr(f, "tell"):
            try:
                pos = f.tell()
            except Exception:
                pos = None
        if hasattr(f, "seek"):
            try:
                f.seek(0)
            except Exception:
                pass

        iterator = f.chunks() if hasattr(f, "chunks") else iter(lambda: f.read(chunk_size), b"")
        for chunk in iterator:
            if not chunk:
                break
            sha.update(chunk)
            if md5:
                md5.update(chunk)
    finally:
        try:
            if pos is not None and hasattr(f, "seek"):
                f.seek(pos)
        except Exception:
            pass
        # Si _file_like a fait un .open(), il faut fermer l'objet externe (obj lui-même)
        if f is fileobj and hasattr(fileobj, "close"):
            # ne pas fermer si c'est un flux partagé ; on fait best-effort
            try:
                fileobj.close()
            except Exception:
                pass

    out = {"hash_sha256": sha.hexdigest()}
    if md5:
        out["hash_md5"] = md5.hexdigest()
    return out


def validate_pdf(file) -> None:
    """
    Valide un fichier PDF sans charger tout le contenu en mémoire.
    - vérifie extension / taille / en-tête / au moins 1 page
    """
    if not file:
        return

    # Extension
    ext = file.name.split(".")[-1].lower() if getattr(file, "name", None) and "." in file.name else ""
    if ext != "pdf":
        raise ValidationError(f"Type de fichier non autorisé: {ext} (PDF uniquement)")

    # Taille
    size = getattr(file, "size", None)
    if size is not None:
        if size > MAX_PDF_SIZE:
            raise ValidationError(f"Fichier trop volumineux (max {MAX_PDF_SIZE // (1024 * 1024)}MB)")
        if size == 0:
            raise ValidationError("Le fichier est vide.")

    # Header + parse minimal
    try:
        f = _file_like(file)
        # Lire uniquement l'entête pour vérifier la signature PDF
        if hasattr(f, "seek"):
            f.seek(0)
        header = f.read(5)
        if not header or not header.startswith(b"%PDF-"):
            raise ValidationError("Le fichier PDF est corrompu ou invalide.")
        # Revenir au début pour PyPDF2
        if hasattr(f, "seek"):
            f.seek(0)
        pdf = PdfReader(f if isinstance(f, io.BufferedIOBase) or hasattr(f, "read") else io.BytesIO(f.read()))
        if len(pdf.pages) == 0:
            raise ValidationError("Le PDF est vide.")
    except ValidationError:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("PDF validation error: %s", exc)
        raise ValidationError("Le fichier PDF est corrompu ou invalide.")
