from celery import Celery
import os

BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
BACKEND_URL = os.getenv('CELERY_RESULT_BACKEND', BROKER_URL)

celery_app = Celery('pr_agent', broker=BROKER_URL, backend=BACKEND_URL)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
)
