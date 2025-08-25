# signature/hsm.py
import logging

import pkcs11
from django.conf import settings
from pkcs11 import Mechanism, KeyType, ObjectClass
from pkcs11.exceptions import NoSuchToken, PinIncorrect
from typing import Tuple

logger = logging.getLogger(__name__)

def hsm_sign(recipient, pin):
    """Sign the envelope's document hash using the HSM."""
    try:
        lib = pkcs11.lib(settings.HSM_LIB_PATH)
        token = lib.get_token(token_label=settings.HSM_TOKEN_LABEL)
        with token.open(user_pin=pin) as session:
            priv = session.get_key(
                label=settings.HSM_KEY_LABEL,
                object_class=ObjectClass.PRIVATE_KEY,
                key_type=KeyType.RSA,
            )

            hash_hex = recipient.envelope.hash_original
            if not hash_hex:
                # Fallback: compute the hash from the original file
                with recipient.envelope.document_file.open('rb') as f:
                    file_data = f.read()
                hash_hex = recipient.envelope.compute_hash(file_data)

            data = bytes.fromhex(hash_hex)
            signature = priv.sign(data, mechanism=Mechanism.RSA_PKCS)
            return signature.hex()
    except NoSuchToken:
        raise Exception("Token HSM non trouvé")
    except PinIncorrect:
        raise Exception("PIN incorrect")
    except Exception as e:
        logger.exception("Erreur HSM inattendue")
        raise Exception(f"Erreur HSM: {str(e)}")


def _open_hsm_session():
    lib = pkcs11.lib(settings.HSM_LIB_PATH)
    token = lib.get_token(token_label=settings.HSM_TOKEN_LABEL)
    if getattr(settings, "HSM_USER_PIN", None):
        return token.open(user_pin=settings.HSM_USER_PIN)
    return token.open()

def hsm_wrap_key(dek: bytes, key_id: int) -> Tuple[int, bytes]:
    """Chiffre la DEK avec la clé PUB RSA (RSA-OAEP) du HSM mappée au key_id."""
    pubs = getattr(settings, "HSM_KEY_LABEL_PUBS", {})
    label_pub = pubs.get(str(key_id)) or pubs.get(key_id)
    if not label_pub:
        raise ValueError(f"Aucun label public HSM pour key_id={key_id}")
    with _open_hsm_session() as session:
        pub = session.get_key(label=label_pub, object_class=ObjectClass.PUBLIC_KEY, key_type=KeyType.RSA)
        wrapped = pub.encrypt(dek, mechanism=Mechanism.RSA_PKCS_OAEP)
    return key_id, wrapped

def hsm_unwrap_key(key_id: int, wrapped: bytes) -> bytes:
    """Déchiffre la DEK via la clé PRIV RSA (RSA-OAEP) mappée au key_id."""
    privs = getattr(settings, "HSM_KEY_LABEL_PRIVS", {})
    label_priv = privs.get(str(key_id)) or privs.get(key_id)
    if not label_priv:
        raise ValueError(f"Aucun label privé HSM pour key_id={key_id}")
    with _open_hsm_session() as session:
        priv = session.get_key(label=label_priv, object_class=ObjectClass.PRIVATE_KEY, key_type=KeyType.RSA)
        dek = priv.decrypt(wrapped, mechanism=Mechanism.RSA_PKCS_OAEP)
    return dek
