import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.models.notifications import Notification
from app.models.employee import UserAccount

logger = logging.getLogger("eraots.notifications")

async def dispatch_notification(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    message: str,
    notification_type: str = "SYSTEM_ALERT"
) -> Notification:
    """
    Core engine for dispatching notifications (FR6).
    1. Saves notification strictly to the database for the Bell icon.
    2. Stubs email delivery (which would connect to SMTP/SendGrid).
    """
    # user_id was historically passed as UserAccount.user_id.
    # Notifications now target Employee IDs (recipient_id), so resolve both safely.
    recipient_id = user_id
    user_account = (
        await db.execute(select(UserAccount).where(UserAccount.user_id == user_id))
    ).scalar_one_or_none()
    if user_account:
        recipient_id = user_account.employee_id

    # 1. DB Persistence
    new_notif = Notification(
        recipient_id=recipient_id,
        title=title,
        message=message,
        type=notification_type,
        channel="IN_APP",
        priority="MEDIUM",
        is_read=False,
        delivery_status="SENT",
    )
    db.add(new_notif)
    await db.flush()
    
    # 2. Email Stub
    # Here we would normally use a celery task or background task to send the email
    # e.g., send_email.delay(user.email, title, message)
    logger.info(f"[EMAIL MOCK] To User={user_id} | Subject: {title} | Body: {message}")
    
    return new_notif
