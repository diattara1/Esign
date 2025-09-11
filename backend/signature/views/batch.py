# signature/views/batch.py
from rest_framework.views import APIView
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.files.uploadedfile import InMemoryUploadedFile, TemporaryUploadedFile
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django.utils.text import get_valid_filename
import json, base64, io, qrcode

from ..tasks import process_batch_sign_job
from ..models import BatchSignJob, BatchSignItem, EnvelopeDocument, EnvelopeRecipient, PrintQRCode, SavedSignature, Envelope, SignatureDocument, PrintQRCode
from ..serializers import BatchSignJobSerializer
from ..crypto_utils import sign_pdf_bytes, compute_hashes, extract_signer_certificate_info  # util commun
from django.conf import settings
# === Helpers d'implémentation exportés pour tasks.py =========================
from PIL import Image, UnidentifiedImageError
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser


def _paste_signature_on_pdf(pdf_bytes: bytes, sig_img_bytes: bytes, placements: list) -> bytes:
    """
    Appose l'image de signature aux positions indiquées (page,x,y,width,height)
    - x,y,width,height : valeurs relatives (0-1) mesurées depuis le HAUT-GAUCHE de la CropBox dans le front.
    - Conversion ici vers repère PDF (bas-gauche) + offset CropBox.
    Retourne un PDF bytes (non signé crypto).
    """
    base_reader = PdfReader(io.BytesIO(pdf_bytes))
    out = PdfWriter()

    # image
    sig_img = Image.open(io.BytesIO(sig_img_bytes)).convert("RGBA")
    sig_reader = ImageReader(sig_img)

    # indexer placements par page (1-based)
    by_page = {}
    for p in placements:
        page_no = int(p["page"])
        by_page.setdefault(page_no, []).append({
            "x": float(p["x"]),
            "y": float(p["y"]),
            "width": float(p["width"]),
            "height": float(p["height"]),
        })

    for page_num in range(1, len(base_reader.pages) + 1):
        page = base_reader.pages[page_num - 1]
        crop = getattr(page, "cropbox", None) or page.mediabox
        crop_llx = float(crop.left)
        crop_lly = float(crop.bottom)
        crop_urx = float(crop.right)
        crop_ury = float(crop.top)
        page_w = crop_urx - crop_llx
        page_h = crop_ury - crop_lly

        overlay_buf = io.BytesIO()
        c = canvas.Canvas(overlay_buf, pagesize=(page_w, page_h))

        for pl in by_page.get(page_num, []):
            # valeurs relatives → points PDF
            x_ui = pl["x"] * page_w
            y_ui = pl["y"] * page_h
            w = pl["width"] * page_w
            h = pl["height"] * page_h

            # front en haut-gauche → PDF en bas-gauche
            x_pdf = crop_llx + x_ui
            y_pdf = crop_lly + (page_h - y_ui - h)
            c.drawImage(sig_reader, x_pdf, y_pdf, width=w, height=h, mask='auto')

        c.showPage()
        c.save()
        overlay_buf.seek(0)

        overlay_reader = PdfReader(overlay_buf)
        overlay_page = overlay_reader.pages[0]

        # fusionner
        base_page = page
        base_page.merge_page(overlay_page)
        out.add_page(base_page)

    buf = io.BytesIO()
    out.write(buf)
    return buf.getvalue()


def _crypto_sign_pdf(
    pdf_bytes: bytes,
    field_name: str | None = None,
    *,
    appearance_image_b64: str | None = None,
) -> bytes:
    """Implémentation réelle de la signature numérique PAdES (util commun)."""
    return sign_pdf_bytes(
        pdf_bytes,
        field_name=field_name,
        appearance_image_b64=appearance_image_b64,
    )


def _add_qr_overlay_all_pages(pdf_bytes: bytes, qr_png_bytes: bytes, size_pt=50, margin_pt=13, y_offset=-5) -> bytes:
    base_reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    for page in base_reader.pages:
        w = float(page.mediabox.width); h = float(page.mediabox.height)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(w, h))
        x = w - margin_pt - size_pt
        y = margin_pt + y_offset
        c.drawImage(ImageReader(io.BytesIO(qr_png_bytes)), x, y, width=size_pt, height=size_pt, mask='auto')
        c.showPage(); c.save(); buf.seek(0)
        overlay_pdf = PdfReader(buf)
        page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)
    out = io.BytesIO(); writer.write(out)
    return out.getvalue()


class SelfSignView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def _parse_json_relaxed(self, val, field_name):
        if val is None:
            return None
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                raise ValueError(f"{field_name} JSON invalide")
        if isinstance(val, (dict, list)):
            return val
        raise ValueError(f"{field_name} JSON invalide")

    def post(self, request):
        """
        Attendu côté front:
          - files[]: 1 PDF
          - placements: JSON [{page, x, y, width, height}]
          - signature_image: dataURL (data:image/png;base64,...) OU fichier image
          - include_qr: (optionnel) true/false — PAR DÉFAUT TRUE
        """
        # 1) placements
        placements = self._parse_json_relaxed(request.data.get("placements"), "placements") or []

        # 2) signature (priorité aux fichiers)
        sig_file = (
            request.FILES.get("signature_file")
            or request.FILES.get("signature_image")
            or request.FILES.get("signature")
        )
        sig_img_bytes = None
        if sig_file:
            if isinstance(sig_file, (InMemoryUploadedFile, TemporaryUploadedFile)):
                sig_img_bytes = sig_file.read()
            else:
                return Response({"error": "type de fichier signature invalide"}, status=400)
        else:
            raw_b64 = (
                request.data.get("signature_base64")
                or request.data.get("signature_image")
                or (self._parse_json_relaxed(request.data.get("signature_data"), "signature_data") or {}).get("data_url")
            )
            if raw_b64:
                if isinstance(raw_b64, (bytes, str)):
                    s = raw_b64.decode() if isinstance(raw_b64, bytes) else raw_b64
                    head, b64 = s.split(",", 1) if "," in s else ("", s)
                    try:
                        sig_img_bytes = base64.b64decode(b64)
                    except Exception:
                        return Response({"error": "signature base64 invalide"}, status=400)
                elif isinstance(raw_b64, (InMemoryUploadedFile, TemporaryUploadedFile)):
                    sig_img_bytes = raw_b64.read()
                else:
                    return Response({"error": "format de signature non supporté"}, status=400)
        if not sig_img_bytes:
            return Response({"error": "signature manquante"}, status=400)

        # Normaliser en PNG (élimine WEBP/SVG/HEIC non supportés)
        try:
            im = Image.open(io.BytesIO(sig_img_bytes)).convert("RGBA")
            out = io.BytesIO()
            im.save(out, format="PNG")
            sig_img_bytes = out.getvalue()
            sig_b64 = base64.b64encode(sig_img_bytes).decode()
        except UnidentifiedImageError:
            return Response({"error": "format de signature non supporté"}, status=400)

        # 3) PDF source — accepte pdf/document/file, puis files[]/files (1er élément)
        pdf_file = (
            request.FILES.get("pdf")
            or request.FILES.get("document")
            or request.FILES.get("file")
            or (request.FILES.getlist("files[]")[0] if hasattr(request.FILES, "getlist") and request.FILES.getlist("files[]") else None)
            or (request.FILES.getlist("files")[0] if hasattr(request.FILES, "getlist") and request.FILES.getlist("files") else None)
        )
        if not pdf_file:
            return Response({"error": "pdf manquant"}, status=400)
        if not isinstance(pdf_file, (InMemoryUploadedFile, TemporaryUploadedFile)):
            return Response({"error": "type de fichier pdf invalide"}, status=400)
        pdf_src = pdf_file.read()

        # 4) apposer l'image puis signer (PAdES) — 1er scellement
        stamped = _paste_signature_on_pdf(pdf_src, sig_img_bytes, placements)
        signed = _crypto_sign_pdf(
            stamped,
            field_name="SelfSign",
            appearance_image_b64=sig_b64,
        )

                # -- Apposer un QR standard (uuid + hmac) et renvoyer le même flux que les enveloppes --
        include_qr = str(request.data.get("include_qr", "true")).lower() in ("1","true","yes","on")
        final_bytes = signed
        
        # 1) Créer une enveloppe "terminée", en te mettant comme créateur
        title = request.data.get("title") or (getattr(pdf_file, "name", "") or "Document")
        envelope = Envelope.objects.create(
            title=title,
            status="completed",
            include_qr_code=include_qr,
            created_by=request.user,   # <-- IMPORTANT (évite l'IntegrityError)
        )
        
        # 2) Créer le destinataire (toi-même), marqué signé
        full_name = request.user.get_full_name() or request.user.username or (request.user.email or "Vous")
        recipient = EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=request.user,
            email=request.user.email or f"user{request.user.id}@example.com",
            full_name=full_name,
            order=1,
            signed=True,
            signed_at=timezone.now(),
        )
        
        # 3) Enregistrer un SignatureDocument lié à ce destinataire
        sig_doc = SignatureDocument.objects.create(
            envelope=envelope,
            recipient=recipient,           # <-- IMPORTANT (évite l'IntegrityError)
            signer=request.user,
            is_guest=False,
            signature_data="self-sign",    # un marqueur simple (string non-null)
            signed_fields={"placements": placements},
        )
        
        # Sauver le PDF signé (1er scellement)
        from django.core.files.base import ContentFile
        from django.utils.text import get_valid_filename
        file_name = get_valid_filename((title or "document").replace("/", "_"))
        if not file_name.lower().endswith(".pdf"):
            file_name += ".pdf"
        sig_doc.signed_file.save(file_name, ContentFile(signed), save=True)
        
        # 4) Empreintes + infos certificat
        hashes = compute_hashes(signed)            # {'hash_md5': '...', 'hash_sha256': '...'}
        cert_info = extract_signer_certificate_info()
        cert_data = sig_doc.certificate_data or {}
        if hashes:
            cert_data.update(hashes)
        cert_data["certificate"] = cert_info
        sig_doc.certificate_data = cert_data
        sig_doc.save(update_fields=["signed_file", "certificate_data"])
        
        # 5) Générer un QR permanent lié à l’enveloppe, apposer, re-signer pour sceller
        if include_qr:
            
        
            qr = PrintQRCode.objects.create(envelope=envelope, qr_type="permanent")
        
            front_base = getattr(settings, "FRONT_BASE_URL", "").rstrip("/")
            if front_base:
                verify_url = f"{front_base}/verify/{qr.uuid}?sig={qr.hmac}"
            else:
                verify_url = request.build_absolute_uri(f"/verify/{qr.uuid}?sig={qr.hmac}")
        
            buf = io.BytesIO()
            qrcode.make(verify_url).save(buf, format="PNG")
            with_qr = _add_qr_overlay_all_pages(signed, buf.getvalue())
            final_bytes = _crypto_sign_pdf(with_qr, field_name="FinalizeQR")
        
            # remplacer le fichier + tracer que le QR est intégré
            sig_doc.signed_file.save(file_name, ContentFile(final_bytes), save=True)
            sig_doc.certificate_data = {**(sig_doc.certificate_data or {}), "qr_embedded": True}
            sig_doc.save(update_fields=["signed_file", "certificate_data"])
        

        # 6) Réponse : PDF final
        dl_name = get_valid_filename((getattr(pdf_file, "name", "") or "document").rsplit(".", 1)[0] + "_signed.pdf")
        return FileResponse(io.BytesIO(final_bytes),
                            as_attachment=True,
                            filename=dl_name,
                            content_type="application/pdf")


class BatchSignCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        mode = request.data.get("mode", "bulk_same_spot")
        if mode not in ("bulk_same_spot", "bulk_var_spots"):
            return Response({"error": "mode invalide"}, status=400)

        # --- include_qr (par défaut TRUE) : transmis au worker
        include_qr = str(request.data.get("include_qr", "true")).lower() in ("1", "true", "yes", "on")

        def parse_json(val, default):
            if val is None:
                return default
            if isinstance(val, (list, dict)):
                return val
            try:
                return json.loads(val)
            except Exception:
                return default

        placements = parse_json(request.data.get("placements"), [])
        placements_by_doc = parse_json(request.data.get("placements_by_doc"), {})

        doc_ids = request.data.getlist("document_ids") if hasattr(request.data, "getlist") else (request.data.get("document_ids") or [])
        files = request.FILES.getlist("files")  # la page envoie 'files', c’est bon

        if not doc_ids and not files:
            return Response({"error": "Aucun document fourni"}, status=400)
        if mode == "bulk_same_spot" and not placements:
            return Response({"error": "placements requis pour bulk_same_spot"}, status=400)

        sig_file = request.FILES.get("signature_image")
        use_saved_signature_id = request.data.get("use_saved_signature_id")
        if not sig_file and not use_saved_signature_id:
            return Response({"error": "signature_image requis (ou use_saved_signature_id)"}, status=400)

        sig_upload_path = None
        if sig_file:
            import tempfile
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(sig_file.read())
            tmp.flush()
            sig_upload_path = tmp.name

        with transaction.atomic():
            job = BatchSignJob.objects.create(created_by=user, mode=mode, total=(len(doc_ids)+len(files)))

            for did in doc_ids or []:
                ed = EnvelopeDocument.objects.filter(pk=int(did)).first()
                if not ed:
                    continue
                pls = placements if mode == "bulk_same_spot" else (placements_by_doc.get(str(did)) or placements_by_doc.get(int(did)) or [])
                BatchSignItem.objects.create(job=job, envelope_document=ed, placements=pls)

            for f in files or []:
                it = BatchSignItem.objects.create(job=job, placements=(placements if mode == "bulk_same_spot" else []))
                it.source_file.save(getattr(f, "name", "upload.pdf"), f, save=True)

        # ===> on transmet include_qr au worker
        process_batch_sign_job.delay(
            job.id,
            use_saved_signature_id=use_saved_signature_id,
            signature_upload_path=sig_upload_path,
            include_qr=include_qr,
        )

        return Response(BatchSignJobSerializer(job).data, status=201)


class BatchSignJobViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BatchSignJobSerializer
    queryset = BatchSignJob.objects.all().order_by("-created_at")

    def get_queryset(self):
        return self.queryset.filter(created_by=self.request.user)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        job = self.get_object()
        if job.created_by != request.user:
            return Response({"error": "Non autorisé"}, status=403)
        if not job.result_zip:
            return Response({"error": "Archive non prête"}, status=400)
        f = job.result_zip
        f.open("rb")
        resp = FileResponse(f, content_type="application/zip")
        resp["Content-Disposition"] = f'attachment; filename="batch_{job.id}.zip"'
        return resp
