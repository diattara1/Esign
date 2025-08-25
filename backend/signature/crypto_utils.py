# signature/crypto_utils.py 

from pathlib import Path
import hashlib, logging,base64,hashlib,inspect,io,time,uuid
from django.conf import settings
from asn1crypto import pem, x509 as asn1x509  # pour ValidationContext pyHanko
from pyhanko.sign import signers
from pyhanko.sign.signers import PdfSigner, PdfSignatureMetadata
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.timestamps.requests_client import HTTPTimeStamper
from pyhanko.sign.validation import ValidationContext
from pyhanko.sign.general import SigningError
from cryptography import x509 as cx509
from cryptography.hazmat.backends import default_backend
from cryptography.x509.oid import NameOID
try:
    from pyhanko.sign.fields import SigFieldSpec as _SigFieldSpec
except ImportError:
    _SigFieldSpec = None

logger = logging.getLogger(__name__)


def extract_signer_certificate_info():
    """
    Lit le certificat de signature (settings.SELF_SIGN_CERT_FILE)
    et renvoie un dict compact pour l'API publique.
    """
    with open(settings.SELF_SIGN_CERT_FILE, "rb") as f:
        raw = f.read()

    # PEM puis fallback DER
    try:
        cert = cx509.load_pem_x509_certificate(raw, default_backend())
    except ValueError:
        cert = cx509.load_der_x509_certificate(raw, default_backend())

    subj = cert.subject

    def _get(oid, default=""):
        try:
            return subj.get_attributes_for_oid(oid)[0].value
        except IndexError:
            return default

    return {
        "common_name": _get(NameOID.COMMON_NAME),
        "organization": _get(NameOID.ORGANIZATION_NAME),
        "country": _get(NameOID.COUNTRY_NAME),
        "serial_number": str(cert.serial_number),
    }
def compute_hashes(pdf_bytes: bytes):
    return {
        "hash_md5": hashlib.md5(pdf_bytes).hexdigest(),
        "hash_sha256": hashlib.sha256(pdf_bytes).hexdigest(),
    }


def _load_x509_cert(pathlike) -> asn1x509.Certificate:
    """
    Utilitaire pyHanko (asn1crypto) pour la ValidationContext.
    """
    p = Path(pathlike)
    data = p.read_bytes()
    if pem.detect(data):
        _, _, data = pem.unarmor(data)
    return asn1x509.Certificate.load(data)


def get_validation_context() -> ValidationContext:
    trust_roots = []
    for p in getattr(settings, "SELF_SIGN_CA_CHAIN", []):
        try:
            trust_roots.append(_load_x509_cert(p))
        except (OSError, ValueError) as e:
            logger.warning("Certificat CA invalide %s: %s", p, e)
    try:
        trust_roots.append(_load_x509_cert(settings.FREETSA_CACERT))
    except (OSError, ValueError) as e:
        logger.warning("Certificat FREETSA invalide %s: %s", settings.FREETSA_CACERT, e)
    return ValidationContext(trust_roots=trust_roots)


def get_timestamper() -> HTTPTimeStamper:
    return HTTPTimeStamper(settings.FREETSA_URL)

def load_simple_signer() -> signers.SimpleSigner:
    return signers.SimpleSigner.load(
        key_file=str(settings.SELF_SIGN_KEY_FILE),
        cert_file=str(settings.SELF_SIGN_CERT_FILE),
        ca_chain_files=[str(p) for p in getattr(settings, "SELF_SIGN_CA_CHAIN", [])],
        key_passphrase=None,
    )

def sign_pdf_bytes(
    pdf_bytes: bytes,
    field_name: str | None = None,
    reason: str = "Signature numérique",
    location: str = "IntelliVibe",
    rect: tuple | None = None,   # (x1, y1, x2, y2)
    page_ix: int | None = None,  # 0-based
    appearance_image_b64: str | None = None,
) -> bytes:
    
    logger.info(f"sign_pdf_bytes: Signature du champ '{field_name}' avec rect={rect}")

    # optionnel: apparence avec image
    stamp_style = None
    if appearance_image_b64:
        try:
            from PIL import Image, UnidentifiedImageError
            from pyhanko import stamp
            from pyhanko.pdf_utils import images
            import binascii
            b64 = appearance_image_b64.split(",", 1)[1] if appearance_image_b64.startswith("data:") else appearance_image_b64
            pil = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
            stamp_style = stamp.TextStampStyle(stamp_text="", background=images.PdfImage(pil))
            logger.info(f"stamp_style créé pour {field_name}")
        except (binascii.Error, UnidentifiedImageError, ValueError) as e:
            logger.warning("Impossible de créer stamp_style pour %s: %s", field_name, e)
            stamp_style = None  # on n'empêche pas la signature si l'image est invalide

    

    vc   = get_validation_context()
    tsa  = get_timestamper()
    sign = load_simple_signer()

    # ✅ CRUCIAL : Générer un nom de champ vraiment unique avec timestamp
    
    if not field_name:
        field_name = f"Sig_{int(time.time())}_{str(uuid.uuid4())[:8]}"
    
    # S'assurer que le nom est vraiment unique en ajoutant des microsecondes
    unique_field_name = f"{field_name}_{int(time.time() * 1000000)}"
    
    logger.info(f"Nom de champ final: {unique_field_name}")

    meta = PdfSignatureMetadata(
        field_name=unique_field_name,  # ✅ Nom unique garanti
        reason=reason,
        location=location,
        embed_validation_info=True,
        use_pades_lta=True,
        validation_context=vc,
    )

    input_stream = io.BytesIO(pdf_bytes)
    out = IncrementalPdfFileWriter(input_stream)
    output_buf = io.BytesIO()

    pdf_signer = PdfSigner(
        signature_meta=meta, 
        signer=sign, 
        timestamper=tsa, 
        stamp_style=stamp_style
    )

    # Vérifier la compatibilité avec les nouvelles API PyHanko
    sign_pdf_params = set(inspect.signature(PdfSigner.sign_pdf).parameters.keys())
    supports_new_field_spec = "new_field_spec" in sign_pdf_params

    try:
        if supports_new_field_spec and _SigFieldSpec:
            # ✅ API récente de PyHanko avec SigFieldSpec
            kwargs = {'field_name': unique_field_name}
            if rect is not None:
                kwargs['box'] = rect
            if page_ix is not None:
                kwargs['on_page'] = page_ix
            field_spec = _SigFieldSpec(**kwargs)
            
            logger.info(f"Signature avec SigFieldSpec: {kwargs}")
            pdf_signer.sign_pdf(out, output=output_buf, new_field_spec=field_spec)
            
        else:
            # ✅ API classique de PyHanko
            logger.info("Signature avec API classique PyHanko")
            pdf_signer.sign_pdf(out, output=output_buf)
            
    except SigningError as e:
        logger.error("Erreur lors de la signature de %s: %s", unique_field_name, e)
        raise

    result = output_buf.getvalue()
    logger.info(f"Signature {unique_field_name} ajoutée avec succès, taille: {len(result)} bytes")
    
    return result

