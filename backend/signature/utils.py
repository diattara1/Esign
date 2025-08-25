# signature/utils.py

"""Utilities for the signature app."""

import io
import logging
from django.conf import settings
from django.core.exceptions import ValidationError
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)
MAX_PDF_SIZE = getattr(settings, "MAX_PDF_SIZE", 10 * 1024 * 1024)


def validate_pdf(file) -> None:
    """Validate an uploaded PDF file.

    Checks extension, size, header and at least one page. Raises
    :class:`ValidationError` if the file is invalid.
    """

    if not file:
        return

    # Extension
    ext = file.name.split(".")[-1].lower() if "." in file.name else ""
    if ext != "pdf":
        raise ValidationError(f"Type de fichier non autorisé: {ext} (PDF uniquement)")

    # Size
    
    if file.size > MAX_PDF_SIZE:
        raise ValidationError(
            f"Fichier trop volumineux (max {MAX_PDF_SIZE // (1024 * 1024)}MB)"
        )

    if file.size == 0:
        raise ValidationError("Le fichier est vide.")

    # Header and pages
    try:
        file.seek(0)
        content = file.read()
        file.seek(0)
        if not content.startswith(b"%PDF-"):
            raise ValidationError("Le fichier PDF est corrompu ou invalide.")
        pdf = PdfReader(io.BytesIO(content))
        if len(pdf.pages) == 0:
            raise ValidationError("Le PDF est vide.")
    except ValidationError:
        raise
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("PDF validation error: %s", exc)
        raise ValidationError("Le fichier PDF est corrompu ou invalide.")

