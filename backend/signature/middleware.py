# signature/middleware.py

import os
import tempfile
import subprocess
import logging
import threading

from django.core.exceptions import SuspiciousFileOperation
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class ClamAVMiddleware(MiddlewareMixin):
    def __init__(self, get_response=None):
        super().__init__(get_response)
        self.use_clamd = False
        self.cd = None
        self.scan_disabled = False
        self.async_scan = bool(int(os.getenv("CLAMAV_ASYNC", "0")))

        try:
            import clamd
            # Essayer d'abord la socket Unix (Linux/macOS)
            try:
                client = clamd.ClamdUnixSocket()
                client.ping()
                self.cd = client
            except Exception:
                # Sinon tenter TCP (Windows ou démo config réseau)
                host = os.getenv('CLAMD_HOST', '127.0.0.1')
                port = int(os.getenv('CLAMD_PORT', 3310))
                client = clamd.ClamdNetworkSocket(host=host, port=port)
                client.ping()
                self.cd = client
            self.use_clamd = True
            logger.info("ClamAVMiddleware: connected to clamd.")
        except Exception as e:
            # Fallback vers clamscan en ligne de commande
            self.use_clamd = False
            logger.warning(f"ClamAVMiddleware: cannot connect to clamd ({e}), will use 'clamscan' subprocess.")

    def _scan_uploaded(self, uploaded):
        """Scan a single UploadedFile instance.

        The file content is kept in memory using a ``SpooledTemporaryFile`` to
        avoid unnecessary disk writes. If ``clamd`` is unavailable we fall back
        to invoking ``clamscan`` and pipe the file through stdin.
        """

        # On récupère l'UploadedFile et son flux
        try:
            with tempfile.SpooledTemporaryFile() as tmp:
                for chunk in uploaded.chunks():
                    tmp.write(chunk)
                tmp.seek(0)

                if self.use_clamd and self.cd:
                    # Scan via démon ClamAV
                    result = self.cd.instream(tmp)
                    status, virus = result.get('stream', (None, None))
                    if status == 'FOUND':
                        raise SuspiciousFileOperation(f"Virus détecté : {virus}")
                else:
                    # Fallback : envoyer le flux en stdin à clamscan
                    if self.scan_disabled:
                        logger.warning(
                            "ClamAVMiddleware: antivirus scan disabled; skipping file scan."
                        )
                        return

                    tmp.seek(0)
                    try:
                        proc = subprocess.run(
                            ['clamscan', '--infected', '--stdout', '-'],
                            stdin=tmp,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            text=True,
                        )
                    except FileNotFoundError:
                        logger.error(
                            "ClamAVMiddleware: 'clamscan' command not found. Antivirus scanning is disabled."
                        )
                        self.scan_disabled = True
                        return

                    output = proc.stdout + proc.stderr
                    if proc.returncode not in (0, 1):
                        logger.warning(
                            "ClamAVMiddleware: 'clamscan' exited with code %s", proc.returncode
                        )
                    if 'FOUND' in output:
                        # Format : stdin: Eicar-Test-Signature FOUND
                        virus = output.split(':', 1)[1].strip().split()[0]
                        raise SuspiciousFileOperation(f"Virus détecté : {virus}")
        except SuspiciousFileOperation:
            # On remonte l'exception pour Django
            raise
        except Exception as e:
            # On logue l'erreur de scan, mais on ne bloque pas la requête
            logger.error(f"ClamAVMiddleware: erreur durant le scan : {e}")

    def process_request(self, request):
        # Ne scanner que les uploads de fichiers
        if request.method == 'POST' and request.FILES:
            for uploaded in request.FILES.values():
                if self.async_scan:
                    threading.Thread(
                        target=self._scan_uploaded, args=(uploaded,), daemon=True
                    ).start()
                else:
                    self._scan_uploaded(uploaded)
        return None

from django.conf import settings


class AllowIframeForPDFOnlyMiddleware:
    """Limit iframe embedding of signed documents.

    For the route serving the signed document PDF we keep ``X-Frame-Options``
    configurable (defaulting to ``SAMEORIGIN``) and restrict the allowed frame
    ancestors via ``Content-Security-Policy``. This prevents the previous
    behaviour where the document could be embedded from any origin.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.x_frame_options = getattr(
            settings, "SIGNATURE_X_FRAME_OPTIONS", "SAMEORIGIN"
        )
        self.frame_ancestors = getattr(
            settings, "SIGNATURE_FRAME_ANCESTORS", "'self'"
        )

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/signature/envelopes/") and request.path.endswith(
            "/signed-document/"
        ):
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if content_type == "application/pdf":
                response.headers["X-Frame-Options"] = self.x_frame_options

                csp = response.headers.get("Content-Security-Policy", "")
                directives = [d.strip() for d in csp.split(";") if d.strip()]
                replaced = False
                for i, directive in enumerate(directives):
                    if directive.startswith("frame-ancestors"):
                        directives[i] = f"frame-ancestors {self.frame_ancestors}"
                        replaced = True
                if not replaced:
                    directives.append(f"frame-ancestors {self.frame_ancestors}")
                response.headers["Content-Security-Policy"] = "; ".join(directives)
            else:
                response.headers["X-Frame-Options"] = "SAMEORIGIN"
        return response


class ClearAuthCookiesMiddleware:
    """Delete auth cookies when requested by the authentication layer."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if getattr(request, "_delete_auth_cookies", False):
            response.delete_cookie("access_token", samesite="None", secure=True)
            response.delete_cookie("refresh_token", samesite="None", secure=True)
        return response
class SecurityMiddleware:
    """
    Middleware de sécurité complet qui adapte les headers selon l'environnement DEBUG
    Remplace tous les autres middlewares de sécurité
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # === CSP adaptatif selon DEBUG ===
        if settings.DEBUG:
            # DEV : CSP permissif pour webpack/vite/hot-reload
            csp_policy = (
                "default-src 'self' https://api.intellivibe.tech; "
                "script-src 'self' 'unsafe-eval' https://api.intellivibe.tech; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "img-src 'self' data: blob: https://api.intellivibe.tech; "
                "font-src 'self' https://fonts.gstatic.com; "
                "connect-src 'self' https://api.intellivibe.tech wss://api.intellivibe.tech ws://localhost:* http://localhost:*; "
                "worker-src 'self' blob:; "
                "object-src 'none'; "
                "frame-ancestors 'self'; "
                "form-action 'self'; "
                "upgrade-insecure-requests;"
            )
        else:
            # PROD : CSP strict avec hashes spécifiques
            csp_policy = (
                "default-src 'none'; "
                "script-src 'self' https://api.intellivibe.tech; "
                "style-src 'self' https://fonts.googleapis.com "
                "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' "
                "'sha256-Xo8/tnRnpUxMw05nUf764oT49W2GEbQN9LaX8Wqxuwg=' "
                "'sha256-JVox5/K3fvT/NN3nmEk3s4rz7GGLBewqsIakVNDmvzo=' "
                "'sha256-PBR7wyQUCxgKCaYTKhUx4OqIiItg2VqUStDUHRsPpjU=' "
                "'sha256-lPCTHBLtDNcuOFfFgIREU/1CoUh9DFTDf5QgCRpsYHQ=' "
                "'sha256-0ACUmbWnAEFJHtMJqCUnKLnyKO0oHUz+g27GGn6+HH8='; "
                "img-src 'self' data: blob: https://api.intellivibe.tech; "
                "font-src 'self' https://fonts.gstatic.com; "
                "connect-src 'self' https://api.intellivibe.tech wss://api.intellivibe.tech; "
                "worker-src 'self' blob:; "
                "manifest-src 'self'; "
                "object-src 'none'; "
                "frame-ancestors 'self'; "
                "form-action 'self'; "
                "base-uri 'self'; "
                "upgrade-insecure-requests;"
            )
        
        response['Content-Security-Policy'] = csp_policy
        
        # === Headers de sécurité universels ===
        response['X-Content-Type-Options'] = 'nosniff'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Cross-Origin-Resource-Policy'] = 'same-origin'
        response['Cross-Origin-Opener-Policy'] = 'same-origin'
        
        # === HSTS seulement en HTTPS ===
        if request.is_secure():
            response['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
        
        return response