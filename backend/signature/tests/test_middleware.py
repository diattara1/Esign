from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from signature.middleware import AllowIframeForPDFOnlyMiddleware


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
