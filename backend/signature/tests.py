import io
import os
import sys
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase, override_settings
import django

# Configure minimal Django settings for standalone test execution
if not settings.configured:
    settings.configure(
        SECRET_KEY='test',
        INSTALLED_APPS=[],
        DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}},
        ROOT_URLCONF=__name__,
    )
    django.setup()

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from signature.hsm import hsm_sign
from pkcs11 import Mechanism


class DummyFile(io.BytesIO):
    def open(self, mode='rb'):
        self.seek(0)
        return self


@override_settings(
    HSM_LIB_PATH='lib',
    HSM_TOKEN_LABEL='token',
    HSM_KEY_LABEL='key',
)
class HSMSignTests(SimpleTestCase):
    def setUp(self):
        self.pin = '1234'
        self.signature_bytes = b'signed'

    def _mock_pkcs11(self, mock_lib, priv=None):
        if priv is None:
            priv = MagicMock()
            priv.sign.return_value = self.signature_bytes
        session = MagicMock()
        session.get_key.return_value = priv
        token = MagicMock()
        token.open.return_value.__enter__.return_value = session
        mock_lib.return_value.get_token.return_value = token
        return priv

    @patch('signature.hsm.pkcs11.lib')
    def test_hsm_sign_uses_stored_hash(self, mock_lib):
        priv = self._mock_pkcs11(mock_lib)
        hash_hex = 'a' * 64
        recipient = SimpleNamespace(envelope=SimpleNamespace(hash_original=hash_hex))

        result = hsm_sign(recipient, self.pin)

        self.assertEqual(result, self.signature_bytes.hex())
        priv.sign.assert_called_once_with(bytes.fromhex(hash_hex), mechanism=Mechanism.RSA_PKCS)

    @patch('signature.hsm.pkcs11.lib')
    def test_hsm_sign_computes_hash_when_missing(self, mock_lib):
        priv = self._mock_pkcs11(mock_lib)
        data = b'document'
        dummy_file = DummyFile(data)
        compute_hash = MagicMock(return_value='b' * 64)
        envelope = SimpleNamespace(
            hash_original='', document_file=dummy_file, compute_hash=compute_hash
        )
        recipient = SimpleNamespace(envelope=envelope)

        result = hsm_sign(recipient, self.pin)

        self.assertEqual(result, self.signature_bytes.hex())
        compute_hash.assert_called_once_with(data)
        priv.sign.assert_called_once_with(bytes.fromhex('b' * 64), mechanism=Mechanism.RSA_PKCS)
