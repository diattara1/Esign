# signature/tasks.py

from celery import shared_task
from django.conf import settings
from datetime import datetime, timedelta
import logging
import base64
import io
import zipfile
import os
import jwt

from django.core.files.base import ContentFile
from django.utils import timezone
from django.utils.text import slugify, get_valid_filename

from PIL import Image, UnidentifiedImageError
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from .models import (
    Envelope,
    EnvelopeRecipient,
    BatchSignJob,
    BatchSignItem,
    SignatureDocument,
    PrintQRCode,
)
from .crypto_utils import (
    sign_pdf_bytes,
    compute_hashes,
    extract_signer_certificate_info,
)
from .email_utils import EmailTemplates, send_templated_email

import qrcode

logger = logging.getLogger(__name__)
MAX_REMINDERS = getattr(settings, "MAX_REMINDERS_SIGN", 3)


@shared_task
def send_signed_pdf_to_all_signers(envelope_id: int):
    """
    À appeler UNIQUEMENT quand l'enveloppe est complétée.
    Récupère le DERNIER PDF signé et l'envoie en PJ à tous les destinataires ayant signé.
    """
    logger.info("send_signed_pdf_to_all_signers called for envelope %s", envelope_id)
    try:
        env = Envelope.objects.get(pk=envelope_id)
    except Envelope.DoesNotExist:
        logger.error("Envelope %s introuvable", envelope_id)
        return

    if env.status != "completed":
        logger.info("Envelope %s status=%s ≠ completed → stop", envelope_id, env.status)
        return

    # Dernier PDF signé = version finale
    latest = (
        SignatureDocument.objects.filter(envelope=env, signed_file__isnull=False)
        .order_by("-signed_at")
        .first()
    )
    if not latest or not latest.signed_file:
        logger.error("Aucun signed_file pour env %s", envelope_id)
        return

    try:
        latest.signed_file.open("rb")
        pdf_bytes = latest.signed_file.read()
        latest.signed_file.close()
    except Exception:
        logger.exception("Lecture du PDF signé échouée pour l'enveloppe %s", envelope_id)
        return

    # Nom de la PJ + lien d’ouverture en ligne
    fname = f"{slugify(env.title) or 'document'}_signed.pdf"
    open_url = f"{settings.FRONT_BASE_URL}/signature/envelopes/{env.id}"

    # Garde-fou taille (ex: 20 Mo)
    attachments = [(fname, pdf_bytes, "application/pdf")]
    if len(pdf_bytes) > 20 * 1024 * 1024:
        logger.warning(
            "PDF trop lourd (%s bytes) pour l'enveloppe %s → envoi sans pièce jointe",
            len(pdf_bytes),
            envelope_id,
        )
        attachments = None

    # Envoi un email INDIVIDUEL à chaque signataire (signed=True)
    signed_recipients = env.recipients.filter(signed=True)
    total = signed_recipients.count()
    logger.info(
        "Envoi du PDF signé à %s signataire(s) de l'enveloppe %s",
        total,
        envelope_id,
    )

    for r in signed_recipients:
        full_name = (r.full_name or r.email or "").strip() or "Signataire"
        try:
            send_templated_email(
                recipient_email=r.email,
                subject=f"Document finalisé : {env.title}",
                message_content=(
                    f"Bonjour {full_name},"
                    f"Le document {env.title} est maintenant complété."
                    + ("Vous trouverez le PDF signé en pièce jointe." if attachments else "")
                ),
                user_name=full_name,
                email_type="Document complété",
                info_message="Cet email contient le document final signé.",
                info_type="success",
                app_name=getattr(settings, "APP_NAME", "Signature Platform"),
                attachments=attachments,  # 👈 PJ
            )
            logger.info("Email final envoyé à %s", r.email)
        except TypeError:
            logger.exception("TypeError lors de l'envoi de l'email final à %s", r.email)
        except Exception:
            logger.exception("Erreur lors de l'envoi de l'email final à %s", r.email)


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
    for p in placements or []:
        page_no = int(p["page"])
        by_page.setdefault(page_no, []).append(
            {
                "x": float(p["x"]),
                "y": float(p["y"]),
                "width": float(p["width"]),
                "height": float(p["height"]),
            }
        )

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
            # UI: x,y,width,height relatifs [0,1]
            x_ui = pl["x"] * crop_w
            y_ui = pl["y"] * crop_h
            w = pl["width"] * crop_w
            h = pl["height"] * crop_h

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


def _add_qr_overlay_all_pages(pdf_bytes: bytes, qr_png_bytes: bytes, size_pt=50, margin_pt=13, y_offset=-5) -> bytes:
    """Appose un QR (PNG) en bas-droite sur *toutes* les pages."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    for page in reader.pages:
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(w, h))
        x = w - margin_pt - size_pt
        y = margin_pt + y_offset
        c.drawImage(ImageReader(io.BytesIO(qr_png_bytes)), x, y, width=size_pt, height=size_pt, mask="auto")
        c.showPage()
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf)
        page.merge_page(overlay.pages[0])
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _normalize_signature_to_png_bytes(buf: bytes) -> bytes:
    """Normalise n'importe quel format image en PNG (RGBA)."""
    im = Image.open(io.BytesIO(buf)).convert("RGBA")
    out = io.BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()


def _crypto_sign_pdf(
    pdf_bytes: bytes,
    field_name: str | None = None,
    *,
    appearance_image_b64: str | None = None,
) -> bytes:
    """Proxy vers sign_pdf_bytes en rechargeant le module (worker long-lived)."""
    from importlib import reload
    from . import crypto_utils as cu

    try:
        reload(cu)
    except ImportError as exc:
        logging.exception("Failed to reload crypto_utils: %s", exc)
    return cu.sign_pdf_bytes(
        pdf_bytes,
        field_name=field_name,
        appearance_image_b64=appearance_image_b64,
    )


def _load_signature(job, use_saved_signature_id=None, signature_upload_path=None) -> bytes:
    """Récupère et normalise l'image de signature pour le job."""
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
        raise ValueError("Aucune signature fournie")

    try:
        return _normalize_signature_to_png_bytes(sig_bytes)
    except UnidentifiedImageError as e:
        raise ValueError("Signature invalide") from e


def _apply_visual_signature(pdf_src: bytes, sig_bytes: bytes, placements: list) -> bytes:
    """Appose l'image de signature sur le PDF."""
    return _paste_signature_on_pdf(pdf_src, sig_bytes, placements)


def _apply_digital_signature(
    pdf_bytes: bytes,
    field_name: str,
    *,
    appearance_image_b64: str | None = None,
) -> bytes:
    """Signe numériquement le PDF."""
    return _crypto_sign_pdf(
        pdf_bytes,
        field_name=field_name,
        appearance_image_b64=appearance_image_b64,
    )


def _generate_qr(job, name: str, placements: list, signed_bytes: bytes) -> bytes:
    """Génère l'enveloppe, le QR et retourne le PDF final signé."""
    title = name
    env = Envelope.objects.create(
        title=title,
        status="completed",
        include_qr_code=True,
        created_by=job.created_by,
    )

    full_name = (
        job.created_by.get_full_name()
        or job.created_by.username
        or (job.created_by.email or "Vous")
    )
    rcpt = EnvelopeRecipient.objects.create(
        envelope=env,
        user=job.created_by,
        email=job.created_by.email or f"user{job.created_by.id}@example.com",
        full_name=full_name,
        order=1,
        signed=True,
        signed_at=timezone.now(),
    )

    sigdoc = SignatureDocument.objects.create(
        envelope=env,
        recipient=rcpt,
        signer=job.created_by,
        is_guest=False,
        signature_data="batch-self-sign",
        signed_fields={"placements": placements},
    )
    file_name = get_valid_filename((title or "document").replace("/", "_"))
    if not file_name.lower().endswith(".pdf"):
        file_name += ".pdf"
    sigdoc.signed_file.save(file_name, ContentFile(signed_bytes), save=True)

    hashes = compute_hashes(signed_bytes)
    cert_info = extract_signer_certificate_info()
    cert_data = sigdoc.certificate_data or {}
    if hashes:
        cert_data.update(hashes)
    cert_data["certificate"] = cert_info
    sigdoc.certificate_data = cert_data
    sigdoc.save(update_fields=["signed_file", "certificate_data"])

    qr = PrintQRCode.objects.create(envelope=env, qr_type="permanent")
    front_base = getattr(settings, "FRONT_BASE_URL", "").rstrip("/")
    if front_base:
        verify_url = f"{front_base}/verify/{qr.uuid}?sig={qr.hmac}"
    else:
        verify_url = f"/verify/{qr.uuid}?sig={qr.hmac}"

    buf = io.BytesIO()
    qrcode.make(verify_url).save(buf, format="PNG")
    with_qr = _add_qr_overlay_all_pages(signed_bytes, buf.getvalue())
    final_bytes = _crypto_sign_pdf(with_qr, field_name="FinalizeQR")

    sigdoc.signed_file.save(file_name, ContentFile(final_bytes), save=True)
    sigdoc.certificate_data = {
        **(sigdoc.certificate_data or {}),
        "qr_embedded": True,
    }
    sigdoc.save(update_fields=["signed_file", "certificate_data"])

    return final_bytes


def _zip_results(job):
    """Crée l'archive ZIP des PDF signés."""
    try:
        memzip = io.BytesIO()
        with zipfile.ZipFile(memzip, "w", zipfile.ZIP_DEFLATED) as zf:
            for it in job.items.filter(status="completed"):
                if it.signed_file:
                    it.signed_file.open("rb")
                    zf.writestr(os.path.basename(it.signed_file.name), it.signed_file.read())
                    it.signed_file.close()
        memzip.seek(0)
        job.result_zip.save(f"batch_{job.id}.zip", ContentFile(memzip.read()), save=False)
    
        job.result_zip.save(
            f"batch_{job.id}.zip", ContentFile(memzip.read()), save=False
        )
    except Exception as exc:
        
        logger.error("Échec de la création du ZIP pour le job %s: %s", job.id, exc)


@shared_task
def process_batch_sign_job(
    job_id: int,
    use_saved_signature_id=None,
    signature_upload_path=None,
    use_hsm=False,
    pin=None,
    include_qr: bool = False,
):
    """
    Traite un BatchSignJob: appose la signature visuelle puis signe chaque PDF.
    Si include_qr=True :
      - crée une enveloppe minimale "completed"
      - enregistre un SignatureDocument (hashes + infos certificat)
      - génère un QR standard /verify/{uuid}?sig=...
      - appose le QR sur toutes les pages
      - re-signe ("FinalizeQR") pour sceller l'overlay
    """
    job = BatchSignJob.objects.select_related("created_by").get(pk=job_id)
    job.status = "running"
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at"])

    # 1) Charger l'image de signature
    try:
        sig_bytes = _load_signature(
            job,
            use_saved_signature_id=use_saved_signature_id,
            signature_upload_path=signature_upload_path,
        )
        sig_b64 = base64.b64encode(sig_bytes).decode()
    except Exception:
        job.status = "failed"
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "finished_at"])
        return

    # 2) Traiter chaque item
    done = failed = 0
    # on écrit directement les PDFs finaux dans les items, puis on zipp à la fin
    for item in job.items.all().select_related("envelope_document"):
        try:
            item.status = "running"
            item.save(update_fields=["status"])

            # PDF source
            pdf_src = None
            name = "document.pdf"
            if item.envelope_document and item.envelope_document.file:
                srcf = item.envelope_document.file
                srcf.open("rb")
                pdf_src = srcf.read()
                srcf.close()
                name = os.path.basename(getattr(item.envelope_document.file, "name", name)) or name
            elif item.source_file:
                srcf = item.source_file
                srcf.open("rb")
                pdf_src = srcf.read()
                srcf.close()
                name = os.path.basename(getattr(item.source_file, "name", name)) or name
            else:
                raise Exception("Aucun fichier source")

            # placements
            placements = item.placements or []
            if not placements:
                raise Exception("Aucun placement fourni")

            # Apposer la signature visuelle
            stamped = _apply_visual_signature(pdf_src, sig_bytes, placements)

            # Signature numérique PAdES (scellé 1)
            signed_bytes = _apply_digital_signature(
                stamped,
                field_name=f"Batch_{item.id}",
                appearance_image_b64=sig_b64,
            )

            final_bytes = signed_bytes
            base_name = (name.rsplit(".", 1)[0] or "document")
            out_name = f"{base_name}_signed.pdf"

            if include_qr:
                final_bytes = _generate_qr(job, name, placements, signed_bytes)

            # Écrire le PDF final dans l'item
            item.signed_file.save(out_name, ContentFile(final_bytes), save=False)
            item.status = "completed"
            item.error = ""
            item.save(update_fields=["signed_file", "status", "error"])

            done += 1
            job.done = done
            job.save(update_fields=["done"])

        except Exception as e:
            item.status = "failed"
            item.error = str(e)
            item.save(update_fields=["status", "error"])
            failed += 1
            job.failed = failed
            job.save(update_fields=["failed"])

    # 3) ZIP des résultats
    _zip_results(job)

    # 4) Statut final
    if failed == 0 and done == job.total:
        job.status = "completed"
    elif done > 0:
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
        "env_id": envelope.id,
        "recipient_id": recipient.id,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int(expire_at.timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return f"{settings.FRONT_BASE_URL}/sign/{envelope.id}?token={token}"


@shared_task
def send_signature_email(envelope_id, recipient_id):
    """Notification initiale avec template (appelée à l'envoi ou à l'ouverture du suivant en séquentiel)."""
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except (Envelope.DoesNotExist, EnvelopeRecipient.DoesNotExist):
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return  # déjà expiré

    link = _build_sign_link(envelope, recipient)

    # Utiliser le template d'email
    try:
        EmailTemplates.signature_request_email(recipient, envelope, link)
    except Exception as e:
        logger.error(f"Erreur envoi email signature: {e}")
        return

    # trace
    recipient.reminder_count += 1
    recipient.notified_at = timezone.now()
    recipient.last_reminder_at = timezone.now()
    # planifier prochain rappel
    recipient.next_reminder_at = timezone.now() + timedelta(days=(envelope.reminder_days or 0))

    recipient.save()


@shared_task
def send_reminder_email(envelope_id, recipient_id):
    """Rappel avec template (passe par process_signature_reminders)."""
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

    # Utiliser le template d'email
    try:
        EmailTemplates.signature_reminder_email(recipient, envelope, link)
    except Exception as e:
        logger.error(f"Erreur envoi email rappel: {e}")
        return

    recipient.reminder_count += 1
    recipient.last_reminder_at = timezone.now()
    recipient.next_reminder_at = timezone.now() + timedelta(days=(envelope.reminder_days or 0))

    recipient.save()


@shared_task
def process_signature_reminders():
    """Job périodique : envoie les rappels dus (next_reminder_at <= now)."""
    now = timezone.now()

    # Enveloppes encore actives
    envelopes = Envelope.objects.filter(status__in=["sent", "pending"], deadline_at__gt=now)

    for env in envelopes:
        if env.flow_type == "sequential":
            # ne relancer que le "courant"
            rec = env.recipients.filter(signed=False).order_by("order").first()
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
    """Avertit le créateur et les non-signés que l'échéance est dépassée avec template."""
    try:
        env = Envelope.objects.get(pk=envelope_id)
    except Envelope.DoesNotExist:
        return

    # Email au créateur
    try:
        EmailTemplates.deadline_expired_email(env.created_by, env)
    except Exception as e:
        logger.error(f"Erreur envoi email deadline créateur: {e}")

    # Email aux destinataires non-signés
    for rec in env.recipients.filter(signed=False):
        try:
            send_templated_email(
                recipient_email=rec.email,
                subject=f"Échéance dépassée : {env.title}",
                message_content=f"La date limite pour signer le document '{env.title}' est maintenant dépassée. Le processus de signature a été interrompu.",
                user_name=rec.full_name,
                email_type="Échéance dépassée",
                info_message="Si vous devez toujours signer ce document, contactez la personne qui vous l'a envoyé pour obtenir un nouveau lien.",
                info_type="warning",
            )
        except Exception as e:
            logger.error(f"Erreur envoi email deadline destinataire {rec.id}: {e}")


@shared_task
def process_deadlines():
    """Job périodique : marque 'expired' les enveloppes non complétées dont la deadline est passée."""
    now = timezone.now()
    to_expire = Envelope.objects.filter(status__in=["sent", "pending"], deadline_at__lte=now)

    for env in to_expire:
        env.status = "expired"
        env.save(update_fields=["status"])
        send_deadline_email.delay(env.id)
        env.recipients.filter(signed=False).update(next_reminder_at=None)


@shared_task
def send_document_completed_notification(envelope_id):
    """Notifie le créateur quand un document est entièrement signé."""
    try:
        env = Envelope.objects.get(pk=envelope_id)
        EmailTemplates.document_completed_email(env.created_by, env)
    except Exception as e:
        logger.error(f"Erreur notification document complété: {e}")


@shared_task
def send_otp_email(recipient_id, otp_code, expiry_minutes=5):
    """Envoie un code OTP avec template."""
    try:
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id)
        EmailTemplates.otp_email(recipient, otp_code, expiry_minutes)
    except Exception as e:
        logger.error(f"Erreur envoi OTP: {e}")
