# ===============================================
# signature/kms.py (NOUVEAU)
# Abstraction KMS minimale avec backend RSA logiciel
# ===============================================
from __future__ import annotations
from dataclasses import dataclass
from typing import Tuple, Dict
from django.conf import settings
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend
from pathlib import Path

def _abs_path(p: str) -> str:
    # transforme "certs/..." en BASE_DIR/certs/...
    if not p:
        return p
    pp = Path(p)
    if pp.is_absolute():
        return str(pp)
    return str(Path(settings.BASE_DIR) / pp)



@dataclass
class KMSKey:
    key_id: int
    public_key: rsa.RSAPublicKey | None
    private_key: rsa.RSAPrivateKey | None
    
    
    
    
class LocalRSAKMS:
    """
    KMS logiciel simple basé sur RSA-OAEP(SHA-256) pour *wrap/unwrap* des DEK.
    Remplaçable par un vrai KMS (AWS/GCP/Azure) ou PKCS#11.
    """
    def __init__(self, keys: Dict[int, KMSKey], active_id: int):
        if active_id not in keys:
            raise ValueError(f"Active KMS key id {active_id} not configured")
        self._keys = keys
        self._active_id = active_id
    
    
    @property
    def active_id(self) -> int:
        return self._active_id
    
    
    def wrap_key(self, dek: bytes) -> Tuple[int, bytes]:
        kid = self._active_id
        pub = self._keys[kid].public_key
        if pub is None:
            raise ValueError(f"Public key for KMS key id {kid} is not available")
        wrapped = pub.encrypt(
            dek,
            padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
            )
        return kid, wrapped
    
    
    def unwrap_key(self, key_id: int, wrapped: bytes) -> bytes:
        if key_id not in self._keys:
            raise ValueError(f"Unknown KMS key id {key_id}")
        priv = self._keys[key_id].private_key
        if priv is None:
            raise ValueError(f"Private key for KMS key id {key_id} is not available on this host")
        dek = priv.decrypt(
            wrapped,
            padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
            )
        return dek
    
    
    
def _load_rsa_public_key(pem_path: str) -> rsa.RSAPublicKey:
    with open(pem_path, "rb") as f:
        data = f.read()
    return serialization.load_pem_public_key(data, backend=default_backend())

def _load_rsa_private_key(pem_path: str) -> rsa.RSAPrivateKey:
    with open(pem_path, "rb") as f:
        data = f.read()
    return serialization.load_pem_private_key(data, password=None, backend=default_backend())




 

def get_kms_client() -> LocalRSAKMS:
    """
    Construit le client KMS local en lisant les variables de settings :
    - KMS_ACTIVE_KEY_ID: int
    - KMS_RSA_PUBLIC_KEYS: dict[int,str] -> chemins PEM publics
    - KMS_RSA_PRIVATE_KEYS: dict[int,str] -> chemins PEM privés (facultatif)
    Normalise les clés (str -> int) et les chemins (relatif -> absolu).
    """
    active = int(getattr(settings, "KMS_ACTIVE_KEY_ID", 1))

    pub_raw  = getattr(settings, "KMS_RSA_PUBLIC_KEYS", {})
    priv_raw = getattr(settings, "KMS_RSA_PRIVATE_KEYS", {})

    if not pub_raw:
        raise ValueError("KMS_RSA_PUBLIC_KEYS is empty; configure at least one public key")

    # Normaliser: clés en int, chemins en absolu
    pubs = {}
    for k, v in pub_raw.items():
        kid = int(k)
        pubs[kid] = _load_rsa_public_key(_abs_path(v))

    privs = {}
    for k, v in priv_raw.items():
        kid = int(k)
        privs[kid] = _load_rsa_private_key(_abs_path(v))

    keys: Dict[int, KMSKey] = {}
    for kid, pub in pubs.items():
        keys[kid] = KMSKey(key_id=kid, public_key=pub, private_key=privs.get(kid))

    return LocalRSAKMS(keys, active)
