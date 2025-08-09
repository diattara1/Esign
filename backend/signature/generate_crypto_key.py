import os
import base64

# Générer une clé de 32 octets (256 bits)
key = os.urandom(32)
# Encoder en base64
key_b64 = base64.b64encode(key).decode('utf-8')
print(f"CRYPTO_KEY={key_b64}c'est tout")