from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import SuspiciousFileOperation
from unittest import mock

from signature.middleware import AllowIframeForPDFOnlyMiddleware, ClamAVMiddleware


class AllowIframeForPDFOnlyMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @override_settings(SIGNATURE_X_FRAME_OPTIONS="ALLOW-FROM https://example.com")
    def test_allows_iframe_for_pdf_responses(self):
        middleware = AllowIframeForPDFOnlyMiddleware(lambda req: HttpResponse(content_type="application/pdf"))
        request = self.factory.get("/api/signature/envelopes/1/signed-document/")
        response = middleware(request)
        self.assertEqual(response.headers["X-Frame-Options"], "ALLOW-FROM https://example.com")

    @override_settings(SIGNATURE_X_FRAME_OPTIONS="ALLOW-FROM https://example.com")
    def test_restricts_non_pdf_responses(self):
        middleware = AllowIframeForPDFOnlyMiddleware(lambda req: HttpResponse(content_type="text/plain"))
        request = self.factory.get("/api/signature/envelopes/1/signed-document/")
        response = middleware(request)
        self.assertEqual(response.headers["X-Frame-Options"], "SAMEORIGIN")


class ClamAVMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_eicar_signature_is_blocked(self):
        eicar = (
            b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
        )
        upload = SimpleUploadedFile("eicar.com", eicar)
        request = self.factory.post("/upload/", {"file": upload})

        middleware = ClamAVMiddleware(lambda req: None)
        middleware.use_clamd = False

        fake_result = mock.Mock(returncode=1, stdout="stdin: Eicar-Test-Signature FOUND\n", stderr="")
        with mock.patch("subprocess.run", return_value=fake_result) as mrun:
            with self.assertRaises(SuspiciousFileOperation):
                middleware.process_request(request)
            self.assertTrue(mrun.called)
