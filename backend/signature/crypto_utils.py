# signature/crypto_utils.py - Version corrigée pour signatures multiples
import io
from pathlib import Path
from django.conf import settings
from asn1crypto import pem, x509
from pyhanko.sign import signers
from pyhanko.sign.signers import PdfSigner, PdfSignatureMetadata
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.timestamps.requests_client import HTTPTimeStamper
from pyhanko.sign.validation import ValidationContext
from pyhanko.sign.fields import SigFieldSpec

def _load_x509_cert(pathlike) -> x509.Certificate:
    p = Path(pathlike)
    data = p.read_bytes()
    if pem.detect(data):
        _, _, data = pem.unarmor(data)
    return x509.Certificate.load(data)

def get_validation_context() -> ValidationContext:
    trust_roots = []
    for p in getattr(settings, "SELF_SIGN_CA_CHAIN", []):
        try:
            trust_roots.append(_load_x509_cert(p))
        except Exception:
            # ignore une entrée invalide plutôt que de crasher
            pass
    # (Optionnel) ajouter la racine TSA si dispo
    try:
        trust_roots.append(_load_x509_cert(settings.FREETSA_CACERT))
    except Exception:
        pass
    return ValidationContext(trust_roots=trust_roots)

def get_timestamper() -> HTTPTimeStamper:
    # cast en str pour éviter les surprises sur certains OS
    return HTTPTimeStamper(settings.FREETSA_URL, str(settings.FREETSA_CACERT))

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
    """
    ✅ Version corrigée qui préserve TOUTES les signatures existantes
    et ajoute une nouvelle signature de manière incrémentale.
    """
    import io, inspect, base64, logging
    from pyhanko.sign.signers import PdfSigner, PdfSignatureMetadata
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    
    logger = logging.getLogger(__name__)
    logger.info(f"sign_pdf_bytes: Signature du champ '{field_name}' avec rect={rect}")

    # optionnel: apparence avec image
    stamp_style = None
    if appearance_image_b64:
        try:
            from PIL import Image
            from pyhanko import stamp
            from pyhanko.pdf_utils import images
            b64 = appearance_image_b64.split(",", 1)[1] if appearance_image_b64.startswith("data:") else appearance_image_b64
            pil = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
            stamp_style = stamp.TextStampStyle(stamp_text="", background=images.PdfImage(pil))
            logger.info(f"stamp_style créé pour {field_name}")
        except Exception as e:
            logger.warning(f"Impossible de créer stamp_style pour {field_name}: {e}")
            stamp_style = None  # on n'empêche pas la signature si l'image est invalide

    try:
        from pyhanko.sign.fields import SigFieldSpec as _SigFieldSpec
    except Exception:
        _SigFieldSpec = None

    vc   = get_validation_context()
    tsa  = get_timestamper()
    sign = load_simple_signer()

    # ✅ CRUCIAL : Générer un nom de champ vraiment unique avec timestamp
    import time, uuid
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

    # ✅ CRUCIAL : Créer un nouveau writer pour CHAQUE signature
    # Cela préserve toutes les signatures existantes dans pdf_bytes
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
            
    except Exception as e:
        logger.error(f"Erreur lors de la signature de {unique_field_name}: {e}")
        raise

    result = output_buf.getvalue()
    logger.info(f"Signature {unique_field_name} ajoutée avec succès, taille: {len(result)} bytes")
    
    return result

# ===================================================================
# ✅ FONCTION BONUS : Vérifier le nombre de signatures dans un PDF
# ===================================================================

def count_signatures_in_pdf(pdf_bytes: bytes) -> int:
    """
    Compte le nombre de signatures numériques dans un PDF.
    Utile pour débugger.
    """
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        
        reader = PdfFileReader(io.BytesIO(pdf_bytes))
        sig_count = 0
        
        for sig in reader.embedded_signatures:
            sig_count += 1
            
        return sig_count
        
    except Exception as e:
        print(f"Erreur lors du comptage des signatures: {e}")
        return -1

def list_signature_fields_in_pdf(pdf_bytes: bytes) -> list:
    """
    Liste tous les champs de signature dans un PDF.
    Utile pour débugger.
    """
    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        
        reader = PdfFileReader(io.BytesIO(pdf_bytes))
        fields = []
        
        for sig in reader.embedded_signatures:
            fields.append({
                'field_name': sig.field_name,
                'signer_name': getattr(sig, 'signer_name', 'Unknown'),
                'signed_dt': getattr(sig, 'signed_dt', 'Unknown')
            })
            
        return fields
        
    except Exception as e:
        print(f"Erreur lors de la liste des champs: {e}")
        return []