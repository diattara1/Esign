# signature/views/batch.py
from rest_framework.views import APIView
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.core.files.uploadedfile import InMemoryUploadedFile, TemporaryUploadedFile
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
import json, base64, io
from django.http import FileResponse

from ..models import BatchSignJob, BatchSignItem, EnvelopeDocument, SavedSignature
from ..serializers import BatchSignJobSerializer
from ..tasks import process_batch_sign_job, _paste_signature_on_pdf, _crypto_sign_pdf


class SelfSignView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _parse_json_relaxed(self, val, field_name):
        """Accepte str / bytes / list[str] / dict → list|dict ; sinon ValueError"""
        if val is None or val == "":
            return None

        # QueryDict -> getlist() peut renvoyer ['[{"page":1,...}]'] ou ['{...}']
        if isinstance(val, (list, tuple)):
            if len(val) == 1 and isinstance(val[0], (str, bytes)):
                val = val[0]
            else:
                # Déjà une liste d'objets JSON ?
                return val

        if isinstance(val, bytes):
            val = val.decode("utf-8", "ignore")

        if isinstance(val, str):
            s = val.strip()
            # Essai direct
            try:
                parsed = json.loads(s)
            except Exception:
                # fallback: remplace quotes simples par doubles (certains front envoient ça)
                try:
                    parsed = json.loads(s.replace("'", '"'))
                except Exception:
                    raise ValueError(f"{field_name} JSON invalide")
            # Si c'est un objet seul → on l'enveloppe en liste (pour placements)
            if field_name == "placements" and isinstance(parsed, dict):
                parsed = [parsed]
            return parsed

        # dict ou list natifs
        if isinstance(val, (dict, list)):
            return val

        raise ValueError(f"{field_name} JSON invalide")

    def post(self, request):
        user = request.user
    
        # --- 1) placements (parser relax) ----------------------------------------
        try:
            raw_pl = request.data.get("placements", None)
            # compat: certains front envoient placements[]=... → on tente aussi getlist
            if raw_pl is None and hasattr(request.data, "getlist"):
                raw_list = request.data.getlist("placements[]")
                raw_pl = raw_list if raw_list else None
            placements = self._parse_json_relaxed(raw_pl, "placements")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)
    
        if not placements or not isinstance(placements, list):
            return Response({"error": "placements doit être un tableau non vide"}, status=400)
    
        # --- 2) documents: files[]/files et/ou document_ids ----------------------
        files = request.FILES.getlist("files[]") or request.FILES.getlist("files")
        doc_ids = []
        if hasattr(request.data, "getlist"):
            doc_ids = request.data.getlist("document_ids") or request.data.getlist("document_ids[]") or []
        elif request.data.get("document_ids"):
            doc_ids = request.data.get("document_ids")
        total = len(files) + len(doc_ids)
        if total == 0:
            return Response({"error": "Aucun document fourni"}, status=400)
    
        # --- 3) signature: fichier envoyé OU signature sauvegardée ---------------
        sig_file = request.FILES.get("signature_image")
        use_saved_signature_id = request.data.get("use_saved_signature_id")
    
        # --- 4) Fast path : 1 doc + sync=true → retour direct du PDF -------------
        sync = str(request.data.get("sync", "false")).lower() == "true"
        if total == 1 and sync:
            # lire les bytes de l'image (obligatoire pour la voie synchrone)
            sig_bytes = None
            if sig_file:
                sig_bytes = sig_file.read()
            elif use_saved_signature_id:
                ss = SavedSignature.objects.filter(pk=use_saved_signature_id, user=user).first()
                if ss:
                    if ss.image:
                        sig_bytes = ss.image.read()
                    elif ss.data_url and "," in ss.data_url:
                        import base64
                        sig_bytes = base64.b64decode(ss.data_url.split(",", 1)[1])
            if not sig_bytes:
                return Response({"error": "signature_image requis (ou use_saved_signature_id)"}, status=400)
    
            # charge le PDF source (depuis id ou upload)
            if doc_ids:
                ed = EnvelopeDocument.objects.filter(pk=int(doc_ids[0])).first()
                if not ed or not ed.file:
                    return Response({"error": "document introuvable"}, status=400)
                ed.file.open("rb"); pdf_src = ed.file.read(); ed.file.close()
                out_name = (ed.name or "document").rsplit(".", 1)[0] + "_signed.pdf"
            else:
                f = files[0]
                pdf_src = f.read()
                base = (getattr(f, "name", "document") or "document").rsplit(".", 1)[0]
                out_name = f"{base}_signed.pdf"
    
            try:
                stamped = _paste_signature_on_pdf(pdf_src, sig_bytes, placements)
                signed_bytes = _crypto_sign_pdf(stamped)  # branche pyHanko ici si besoin
            except Exception as e:
                return Response({"error": f"Erreur signature: {e}"}, status=400)
    
            buf = io.BytesIO(signed_bytes); buf.seek(0)
            resp = FileResponse(buf, content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="{out_name}"'
            return resp
    
        # --- 5) Sinon : job Celery (ZIP en sortie) -------------------------------
        # on exige au moins une source de signature pour la voie asynchrone
        if not sig_file and not use_saved_signature_id:
            return Response({"error": "signature_image requis (ou use_saved_signature_id)"}, status=400)
    
        # si un fichier d'image est fourni, on l'écrit en temp pour le worker
        sig_upload_path = None
        if sig_file:
            import tempfile
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(sig_file.read())
            tmp.flush()
            sig_upload_path = tmp.name
    
        with transaction.atomic():
            job = BatchSignJob.objects.create(
                created_by=user,
                mode="self_single" if total == 1 else "bulk_same_spot",
                total=total,
            )
            # items depuis IDs
            for did in doc_ids:
                ed = EnvelopeDocument.objects.filter(pk=int(did)).first()
                if ed:
                    BatchSignItem.objects.create(job=job, envelope_document=ed, placements=placements)
            # items depuis fichiers uploadés
            for f in files:
                it = BatchSignItem.objects.create(job=job, placements=placements)
                it.source_file.save(getattr(f, "name", "upload.pdf"), f, save=True)
    
        # 👉 on transmet bien la source de signature au worker
        process_batch_sign_job.delay(
            job.id,
            use_saved_signature_id=use_saved_signature_id,
            signature_upload_path=sig_upload_path,
        )
    
        return Response(BatchSignJobSerializer(job).data, status=201)


class BatchSignCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        mode = request.data.get("mode", "bulk_same_spot")
        if mode not in ("bulk_same_spot", "bulk_var_spots"):
            return Response({"error": "mode invalide"}, status=400)
    
        # ---- parse placements / placements_by_doc
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
    
        # ---- fichiers et ids
        doc_ids = request.data.getlist("document_ids") if hasattr(request.data, "getlist") else (request.data.get("document_ids") or [])
        files = request.FILES.getlist("files")  # la page envoie 'files', c’est bon
    
        if not doc_ids and not files:
            return Response({"error": "Aucun document fourni"}, status=400)
        if mode == "bulk_same_spot" and not placements:
            return Response({"error": "placements requis pour bulk_same_spot"}, status=400)
    
        # ---- source de signature (obligatoire en batch)
        sig_file = request.FILES.get("signature_image")
        use_saved_signature_id = request.data.get("use_saved_signature_id")
        if not sig_file and not use_saved_signature_id:
            return Response({"error": "signature_image requis (ou use_saved_signature_id)"}, status=400)
    
        # si un fichier est fourni, on le met en temp pour le worker
        sig_upload_path = None
        if sig_file:
            import tempfile
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(sig_file.read())
            tmp.flush()
            sig_upload_path = tmp.name
    
        # ---- création du job et de ses items
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
    
        # ---- lancer le worker EN LUI PASSANT la signature
        process_batch_sign_job.delay(
            job.id,
            use_saved_signature_id=use_saved_signature_id,
            signature_upload_path=sig_upload_path,
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
        from django.http import FileResponse
        resp = FileResponse(f, content_type="application/zip")
        resp["Content-Disposition"] = f'attachment; filename="batch_{job.id}.zip"'
        return resp
