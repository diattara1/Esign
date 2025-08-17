# signature/tasks.py

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import datetime, timedelta
import jwt
import logging
import base64  
from .models import Envelope, EnvelopeRecipient,BatchSignJob, BatchSignItem
import io, zipfile, os
from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from .crypto_utils import sign_pdf_bytes


from django.conf import settings

logger = logging.getLogger(__name__)

MAX_REMINDERS = getattr(settings, 'MAX_REMINDERS_SIGN', 3)

def _paste_signature_on_pdf(pdf_bytes: bytes, sig_img_bytes: bytes, placements: list):
    """
    Appose l'image de signature aux positions indiquées (page,x,y,width,height)
    - x,y,width,height : unités PDF (points) mesurées depuis le HAUT-GAUCHE de la CropBox dans le front.
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
        # sécuriser les types
        page_no = int(p["page"])
        by_page.setdefault(page_no, []).append({
            "x": float(p["x"]),
            "y": float(p["y"]),
            "width": float(p["width"]),
            "height": float(p["height"]),
        })

    for page_num in range(1, len(base_reader.pages) + 1):
        page = base_reader.pages[page_num - 1]

        # Dimensions/offsets : utiliser la CropBox si présente (c'est ce que voit pdf.js)
        crop = getattr(page, "cropbox", None) or page.mediabox
        crop_llx = float(crop.left)
        crop_lly = float(crop.bottom)
        crop_urx = float(crop.right)
        crop_ury = float(crop.top)
        crop_w = crop_urx - crop_llx
        crop_h = crop_ury - crop_lly

        # Overlay reportlab sur la MediaBox (repère natif du PDF)
        media_w = float(page.mediabox.width)
        media_h = float(page.mediabox.height)

        if page_num not in by_page:
            out.add_page(page)
            continue

        # Créer un calque (même taille que la MediaBox)
        packet = io.BytesIO()
        c = canvas.Canvas(packet, pagesize=(media_w, media_h))

        for pl in by_page[page_num]:
            # UI: x,y depuis TOP-LEFT de CropBox  → PDF: BOTTOM-LEFT MediaBox
            x_ui = pl["x"]
            y_ui = pl["y"]
            w = pl["width"]
            h = pl["height"]

            # inverser Y dans la CropBox
            y_from_bottom_in_crop = crop_h - y_ui - h

            # ajouter l'offset de la CropBox pour revenir au repère MediaBox
            x_pdf = crop_llx + x_ui
            y_pdf = crop_lly + y_from_bottom_in_crop

            c.drawImage(sig_reader, x_pdf, y_pdf, width=w, height=h, mask="auto")

        c.save()
        packet.seek(0)

        overlay_reader = PdfReader(packet)
        overlay_page = overlay_reader.pages[0]
        page.merge_page(overlay_page)
        out.add_page(page)

    buf = io.BytesIO()
    out.write(buf)
    return buf.getvalue()



# signature/tasks.py

def _crypto_sign_pdf(pdf_bytes: bytes, field_name: str | None = None) -> bytes:
    # Reload pour éviter les versions obsolètes en mémoire du worker
    from importlib import reload
    from . import crypto_utils as cu
    try:
        reload(cu)
    except Exception:
        pass
    return cu.sign_pdf_bytes(pdf_bytes, field_name=field_name)



@shared_task
def process_batch_sign_job(job_id: int, use_saved_signature_id=None, signature_upload_path=None, use_hsm=False, pin=None):
    """
    Traite un BatchSignJob: appose l'image puis signe chaque PDF.
    - use_saved_signature_id: ID d'une SavedSignature (prioritaire si fourni)
    - signature_upload_path: path d'un fichier image uploadé (si pas de saved)
    """
    job = BatchSignJob.objects.get(pk=job_id)
    job.status = "running"
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])

    # charge l'image de signature
    sig_bytes = None
    if use_saved_signature_id:
        from .models import SavedSignature
        ss = SavedSignature.objects.get(pk=use_saved_signature_id, user=job.created_by)
        if getattr(ss, "image", None):
            f = ss.image
            f.open("rb")
            sig_bytes = f.read()
            f.close()
        elif getattr(ss, "data_url", None):
            head, b64 = ss.data_url.split(",", 1) if "," in ss.data_url else ("", ss.data_url)
            sig_bytes = base64.b64decode(b64)

    elif signature_upload_path:
        with open(signature_upload_path, "rb") as f:
            sig_bytes = f.read()

    if not sig_bytes:
        job.status = "failed"
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "finished_at"])
        return

    # traite chaque item
    for item in job.items.all():
        try:
            item.status = "running"
            item.save(update_fields=["status"])

            # récupère le PDF source
            if item.envelope_document and item.envelope_document.file:
                srcf = item.envelope_document.file
                srcf.open("rb"); pdf_src = srcf.read(); srcf.close()
            elif item.source_file:
                srcf = item.source_file
                srcf.open("rb"); pdf_src = srcf.read(); srcf.close()
            else:
                raise Exception("Aucun fichier source")

            # placements
            placements = item.placements or []
            if not placements:
                raise Exception("Aucun placement fourni")

            # appose l'image
            stamped = _paste_signature_on_pdf(pdf_src, sig_bytes, placements)

            # signature numérique (branche ici ton pyHanko/HSM)
            signed_bytes = _crypto_sign_pdf(stamped, field_name=f"Batch_{item.id}")


            base_name = None
            if item.envelope_document and item.envelope_document.name:
                base_name = item.envelope_document.name.rsplit(".", 1)[0]
            elif item.source_file and item.source_file.name:
                base_name = item.source_file.name.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            else:
                base_name = f"doc_{item.id}"
            fname = f"{base_name}_signed.pdf"
            item.signed_file.save(fname, ContentFile(signed_bytes), save=False)
            item.status = "completed"
            item.error = ""
            item.save(update_fields=["signed_file", "status", "error"])

            job.done += 1
            job.save(update_fields=["done"])
        except Exception as e:
            item.status = "failed"
            item.error = str(e)
            item.save(update_fields=["status", "error"])
            job.failed += 1
            job.save(update_fields=["failed"])

    # ZIP des résultats
    try:
        # créer un zip en mémoire
        memzip = io.BytesIO()
        with zipfile.ZipFile(memzip, "w", zipfile.ZIP_DEFLATED) as zf:
            for it in job.items.filter(status="completed"):
                if it.signed_file:
                    it.signed_file.open("rb")
                    zf.writestr(os.path.basename(it.signed_file.name), it.signed_file.read())
                    it.signed_file.close()
        memzip.seek(0)
        job.result_zip.save(f"batch_{job.id}.zip", ContentFile(memzip.read()), save=False)
    except Exception as zerr:
        # pas bloquant
        pass

    # statut final
    if job.failed == 0 and job.done == job.total:
        job.status = "completed"
    elif job.done > 0:
        job.status = "partial"
    else:
        job.status = "failed"
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at", "result_zip"])
def _build_sign_link(envelope, recipient):
    """Construit le lien de signature (in-app si user, sinon lien invité avec JWT)."""
    expire_at = datetime.utcnow() + timedelta(hours=24)
    if recipient.user:
        return f"{settings.FRONT_BASE_URL}/signature/envelopes/{envelope.id}/sign"

    payload = {
        'env_id': envelope.id,
        'recipient_id': recipient.id,
        'iat': int(datetime.utcnow().timestamp()),
        'exp': int(expire_at.timestamp())
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    return f"{settings.FRONT_BASE_URL}/sign/{envelope.id}?token={token}"


def _send_email(subject, message, to):
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to],
        fail_silently=False,
    )


@shared_task
def send_signature_email(envelope_id, recipient_id):
    """Notification initiale (appelée à l’envoi ou à l’ouverture du suivant en séquentiel)."""
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except (Envelope.DoesNotExist, EnvelopeRecipient.DoesNotExist):
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return  # déjà expiré

    link = _build_sign_link(envelope, recipient)
    subject = f"Signature requise : {envelope.title}"
    message = f"Bonjour {recipient.full_name},\n\nVeuillez signer « {envelope.title} » :\n{link}\n\nMerci."

    _send_email(subject, message, recipient.email)

    # trace
    recipient.reminder_count += 1
    recipient.notified_at = timezone.now()
    recipient.last_reminder_at = timezone.now()
    # planifier prochain rappel
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()


@shared_task
def send_reminder_email(envelope_id, recipient_id):
    """Rappel (passe par process_signature_reminders)."""
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except (Envelope.DoesNotExist, EnvelopeRecipient.DoesNotExist):
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return

    if recipient.reminder_count >= MAX_REMINDERS:
        return

    link = _build_sign_link(envelope, recipient)
    subject = f"Rappel de signature : {envelope.title}"
    message = f"Bonjour {recipient.full_name},\n\nUn rappel pour signer « {envelope.title} » :\n{link}\n\nMerci."

    _send_email(subject, message, recipient.email)

    recipient.reminder_count += 1
    recipient.last_reminder_at = timezone.now()
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()


@shared_task
def process_signature_reminders():
    """Job périodique : envoie les rappels dus (next_reminder_at <= now)."""
    now = timezone.now()

    # Enveloppes encore actives
    envelopes = Envelope.objects.filter(
        status__in=['sent', 'pending'],
        deadline_at__gt=now
    )

    for env in envelopes:
        if env.flow_type == 'sequential':
            # ne relancer que le "courant"
            rec = env.recipients.filter(signed=False).order_by('order').first()
            if not rec:
                continue
            if rec.next_reminder_at and rec.next_reminder_at <= now and rec.reminder_count < MAX_REMINDERS:
                send_reminder_email.delay(env.id, rec.id)
        else:
            # parallèle : tous les non signés
            for rec in env.recipients.filter(signed=False):
                if rec.next_reminder_at and rec.next_reminder_at <= now and rec.reminder_count < MAX_REMINDERS:
                    send_reminder_email.delay(env.id, rec.id)


@shared_task
def send_deadline_email(envelope_id):
    """Avertit le créateur et les non-signés que l’échéance est dépassée."""
    try:
        env = Envelope.objects.get(pk=envelope_id)
    except Envelope.DoesNotExist:
        return

    subject = f"Échéance dépassée : {env.title}"
    msg_owner = f"Bonjour,\n\nL’échéance du document « {env.title} » est dépassée. Statut: {env.status}."
    _send_email(subject, msg_owner, env.created_by.email)

    for rec in env.recipients.filter(signed=False):
        msg_rec = f"Bonjour {rec.full_name},\n\nL’échéance pour signer « {env.title} » est dépassée."
        _send_email(subject, msg_rec, rec.email)


@shared_task
def process_deadlines():
    """Job périodique : marque 'expired' les enveloppes non complétées dont la deadline est passée."""
    now = timezone.now()
    to_expire = Envelope.objects.filter(
        status__in=['sent', 'pending'],
        deadline_at__lte=now
    )

    for env in to_expire:
        env.status = 'expired'
        env.save(update_fields=['status'])
        send_deadline_email.delay(env.id)
        env.recipients.filter(signed=False).update(next_reminder_at=None)
