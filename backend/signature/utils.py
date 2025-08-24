# signature/utils.py

"""Utilities for the signature app."""

import io
import logging

from django.core.exceptions import ValidationError
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


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
    if file.size > 10 * 1024 * 1024:
        raise ValidationError("Fichier trop volumineux (max 10MB)")

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

