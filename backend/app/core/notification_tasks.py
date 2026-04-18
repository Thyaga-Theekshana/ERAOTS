import os
import asyncio
from celery import Celery
from celery.schedules import crontab
from datetime import timedelta

# It's important to use the correct broken URI
redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "eraots_notifications",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Colombo",
    enable_utc=True,
)

# Helper function to run async functions in Celery
def run_async(coro):
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # Inside a weird loop context - not typical for Celery worker
        return asyncio.run_coroutine_threadsafe(coro, loop).result()
    else:
        return loop.run_until_complete(coro)

@celery_app.task
def task_send_email(employee_id_str: str, title: str, body: str):
    # Dummy mock for email
    print(f"SMTP -> {employee_id_str}: {title}")
    return True

@celery_app.task
def task_send_whatsapp(employee_id_str: str, title: str, body: str):
    # Dummy mock for whatsapp
    print(f"WHATSAPP -> {employee_id_str}: {title}")
    return True

@celery_app.task
def task_check_late_arrivals():
    from app.core.alert_triggers import check_late_arrivals
    run_async(check_late_arrivals())

@celery_app.task
def task_check_absent_employees():
    from app.core.alert_triggers import check_absent_employees
    run_async(check_absent_employees())

@celery_app.task
def task_check_missed_exits():
    from app.core.alert_triggers import check_missed_exit_scans
    run_async(check_missed_exit_scans())

@celery_app.task
def task_check_frequent_lateness():
    from app.core.alert_triggers import check_frequent_lateness
    run_async(check_frequent_lateness())

@celery_app.task
def task_meeting_reminders():
    from app.core.alert_triggers import meeting_reminder_dispatcher
    run_async(meeting_reminder_dispatcher())

@celery_app.task
def task_dispatch_announcement(announcement_id: str):
    from app.core.alert_triggers import announcement_dispatcher
    run_async(announcement_dispatcher(announcement_id))

@celery_app.task
def task_check_long_break(employee_id: str):
    from app.core.alert_triggers import check_long_breaks
    run_async(check_long_breaks(employee_id))

# Celery Beat Schedule Configuration
celery_app.conf.beat_schedule = {
    "check-late-arrivals": {
        "task": "app.core.notification_tasks.task_check_late_arrivals",
        "schedule": crontab(minute=30),
    },
    "check-absent-employees": {
        "task": "app.core.notification_tasks.task_check_absent_employees",
        "schedule": crontab(minute=0), # every hour at :00 (could be crontab(hour='*/1', minute=0))
    },
    "check-missed-exits": {
        "task": "app.core.notification_tasks.task_check_missed_exits",
        "schedule": crontab(hour=23, minute=30),
    },
    "check-frequent-lateness": {
        "task": "app.core.notification_tasks.task_check_frequent_lateness",
        "schedule": crontab(hour=18, minute=0),
    },
    "meeting-reminder-dispatcher": {
        "task": "app.core.notification_tasks.task_meeting_reminders",
        "schedule": 60.0,
    },
}
