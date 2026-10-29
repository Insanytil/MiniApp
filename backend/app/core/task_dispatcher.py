import uuid

from kombu.exceptions import KombuError

from app.workers.celery_app import celery_app
from app.workers.tasks.email_tasks import process_email_job_task


def dispatch_email_job(*, job_id: uuid.UUID, task_id: uuid.UUID) -> bool:
    try:
        process_email_job_task.apply_async(
            kwargs={"job_id": str(job_id)},
            task_id=str(task_id),
        )
    except (KombuError, OSError):
        return False
    return True


def revoke_job(*, task_id: uuid.UUID) -> bool:
    try:
        celery_app.control.revoke(str(task_id), terminate=False)
    except (KombuError, OSError):
        return False
    return True