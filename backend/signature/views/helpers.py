import logging
from django.conf import settings
import jwt
from jwt import InvalidTokenError, ExpiredSignatureError
from django.http import HttpResponse

logger = logging.getLogger(__name__)

def clean_b64(data: str | None) -> str | None:
    """Accepte 'data:image/...;base64,AAAA' ou déjà 'AAAA', renvoie le base64 pur ou None."""
    if not data:
        return None
    if isinstance(data, str) and data.startswith('data:image'):
        return data.split(',', 1)[1]
    return data

def verify_guest_token(envelope, token):
    """Retourne le payload (dict) si le token invité est valide et correspond à l'enveloppe, sinon None."""
    if not token:
        return None
    secret = getattr(settings, "SIGNATURE_JWT_SECRET", settings.SECRET_KEY)
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("env_id") != envelope.id:
            return None
        return payload
    except (ExpiredSignatureError, InvalidTokenError):
        return None

def safe_filename(name: str) -> str:
    base = (name or "document").replace('"', "").strip() or "document"
    if not base.lower().endswith(".pdf"):
        base += ".pdf"
    return base

def serve_pdf(file_field, filename: str, inline: bool = True) -> HttpResponse:
    try:
        fh = file_field.storage.open(file_field.name, "rb")
        data = fh.read()
        fh.close()
    except Exception:
        logger.exception("Erreur lors du service du PDF")
        raise

    resp = HttpResponse(data, content_type="application/pdf")
    disp = "inline" if inline else "attachment"
    safe_name = safe_filename(filename)
    resp["Content-Disposition"] = f'{disp}; filename="{safe_name}"; filename*=UTF-8\'\'{safe_name}'

    resp["X-Frame-Options"] = "SAMEORIGIN"
    frame_ancestors = getattr(settings, "SIGNATURE_FRAME_ANCESTORS", "*")
    resp["Content-Security-Policy"] = (
        f"frame-ancestors {frame_ancestors}; sandbox allow-scripts allow-forms allow-same-origin"
    )

    resp["Cache-Control"] = "no-store"
    resp["Pragma"] = "no-cache"
    resp["Expires"] = "0"
    return resp
