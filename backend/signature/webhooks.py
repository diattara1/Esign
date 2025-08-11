import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def trigger_webhooks(event, envelope):
    """Send webhook notifications for a given event."""
    from .models import WebhookEndpoint  # local import to avoid circular

    endpoints = WebhookEndpoint.objects.filter(event=event, active=True)
    if not endpoints.exists():
        return

    payload = {
        "event": event,
        "envelope_id": envelope.id,
        "status": envelope.status,
        "title": envelope.title,
    }
    headers = {"Content-Type": "application/json"}
    for endpoint in endpoints:
        try:
            if endpoint.secret:
                headers["X-Hub-Signature"] = endpoint.secret
            requests.post(endpoint.url, json=payload, timeout=5, headers=headers)
        except Exception as exc:
            logger.error(f"Webhook call failed for {endpoint.url}: {exc}")
