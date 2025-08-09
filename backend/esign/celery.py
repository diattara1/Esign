# rh_system/celery.py
import os
from celery import Celery

# Spécifie les settings Django à charger
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'esign.settings')

# Crée l'application Celery
app = Celery('esign')

# Utilise les paramètres de Django avec le namespace CELERY_*
app.config_from_object('django.conf:settings', namespace='CELERY')

# Autodiscover les tasks dans tous les fichiers `tasks.py` des apps
app.autodiscover_tasks()



