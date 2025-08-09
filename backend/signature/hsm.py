# signature/hsm.py
import pkcs11
from django.conf import settings
from pkcs11 import Mechanism, KeyType, ObjectClass
from pkcs11.exceptions import NoSuchToken, PinIncorrect

def hsm_sign(recipient, pin):
    """
    Utilise PKCS#11 pour récupérer la clé privée du HSM et signer le hash du document.
    """
    try:
        lib = pkcs11.lib(settings.HSM_LIB_PATH)
        token = lib.get_token(token_label=settings.HSM_TOKEN_LABEL)
        with token.open(user_pin=pin) as session:
            priv = session.get_key(
                label=settings.HSM_KEY_LABEL,
                object_class=ObjectClass.PRIVATE_KEY,
                key_type=KeyType.RSA
            )
            data = recipient.envelope.compute_hash().encode()
            signature = priv.sign(data, mechanism=Mechanism.SHA256_RSA_PKCS)
            return signature.hex()
    except NoSuchToken:
        raise Exception("Token HSM non trouvé")
    except PinIncorrect:
        raise Exception("PIN incorrect")
    except Exception as e:
        raise Exception(f"Erreur HSM: {str(e)}")