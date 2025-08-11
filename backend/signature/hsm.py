# signature/hsm.py
import pkcs11
from django.conf import settings
from pkcs11 import Mechanism, KeyType, ObjectClass
from pkcs11.exceptions import NoSuchToken, PinIncorrect

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
                recipient.envelope.document_file.open('rb')
                file_data = recipient.envelope.document_file.read()
                recipient.envelope.document_file.close()
                hash_hex = recipient.envelope.compute_hash(file_data)

            data = bytes.fromhex(hash_hex)
            signature = priv.sign(data, mechanism=Mechanism.RSA_PKCS)
            return signature.hex()
    except NoSuchToken:
        raise Exception("Token HSM non trouvé")
    except PinIncorrect:
        raise Exception("PIN incorrect")
    except Exception as e:
        raise Exception(f"Erreur HSM: {str(e)}")
