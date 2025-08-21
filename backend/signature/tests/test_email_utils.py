from django.test import TestCase
from signature.models import Envelope
from signature.email_utils import send_signature_email_v2, send_reminder_email_v2


class EmailUtilsErrorTests(TestCase):
    def test_send_signature_email_v2_logs_and_raises(self):
        with self.assertLogs('signature.email_utils', level='ERROR') as log:
            with self.assertRaises(Envelope.DoesNotExist):
                send_signature_email_v2(0, 0)
        self.assertTrue(log.output)

    def test_send_reminder_email_v2_logs_and_raises(self):
        with self.assertLogs('signature.email_utils', level='ERROR') as log:
            with self.assertRaises(Envelope.DoesNotExist):
                send_reminder_email_v2(0, 0)
        self.assertTrue(log.output)
