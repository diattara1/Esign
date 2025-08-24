# signature/middleware.py

import os
import tempfile
import subprocess
import logging

from django.core.exceptions import SuspiciousFileOperation
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class ClamAVMiddleware(MiddlewareMixin):
    def __init__(self, get_response=None):
        super().__init__(get_response)
        self.use_clamd = False
        self.cd = None

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

    def process_request(self, request):
        # Ne scanner que les uploads de fichiers
        if request.method == 'POST' and request.FILES:
            for uploaded in request.FILES.values():
                # On récupère l'UploadedFile et son flux
                stream = uploaded.file
                try:
                    if self.use_clamd and self.cd:
                        # Scan via démon ClamAV
                        result = self.cd.instream(stream)
                        status, virus = result.get('stream', (None, None))
                        if status == 'FOUND':
                            raise SuspiciousFileOperation(f"Virus détecté : {virus}")
                    else:
                        # Fallback : écrire dans un tmp, puis appeler clamscan
                        with tempfile.NamedTemporaryFile(delete=False) as tmp:  # delete=True si la plateforme le permet
                            for chunk in uploaded.chunks():
                                tmp.write(chunk)
                            tmp.flush()
                            tmp_path = tmp.name
                        try:
                            proc = subprocess.run(
                                ['clamscan', '--infected', '--stdout', tmp_path],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
                            )
                        finally:
                            os.unlink(tmp_path)
                        output = proc.stdout + proc.stderr
                        if 'FOUND' in output:
                            # Format : C:\path\to\tmpfile: Eicar-Test-Signature FOUND
                            virus = output.split(':', 1)[1].strip().split()[0]
                            raise SuspiciousFileOperation(f"Virus détecté : {virus}")
                except SuspiciousFileOperation:
                    # On remonte l'exception pour Django
                    raise
                except Exception as e:
                    # On logue l'erreur de scan, mais on ne bloque pas la requête
                    logger.error(f"ClamAVMiddleware: erreur durant le scan : {e}")

        return None

class AllowIframeForPDFOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/signature/envelopes/") and request.path.endswith("/signed-document/"):
            response.headers["X-Frame-Options"] = "ALLOWALL"
        return response
