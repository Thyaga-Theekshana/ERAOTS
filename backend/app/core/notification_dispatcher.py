from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.models.alert_engine import AlertPreference, NotificationLog
from datetime import datetime, timezone
import logging
import uuid
# We will import the celery tasks inside the function or after they are created
# to avoid circular imports.
from typing import List, Optional

logger = logging.getLogger("eraots.notification_dispatcher")

async def dispatch_notification(
    employee_id: str | uuid.UUID,
    alert_type: str,
    title: str,
    body: str,
    priority: str,
    override_channels: Optional[List[str]] = None
):
    """
    Core notification dispatcher. Respects user preferences, handles multi-channel,
    and logs everything.
    """
    from app.core.notification_tasks import task_send_email, task_send_whatsapp
    
    try:
        async with AsyncSessionLocal() as db:
            # Step 1: Load employee's preference
            pref_result = await db.execute(
                select(AlertPreference).where(AlertPreference.employee_id == employee_id)
            )
            preference = pref_result.scalar_one_or_none()
            
            if not preference:
                # Create default if not exists
                preference = AlertPreference(employee_id=employee_id)
                db.add(preference)
                await db.commit()
                await db.refresh(preference)

            # Step 2: Skip if alert_type is not enabled
            if alert_type not in preference.enabled_types:
                logger.info(f"Notification '{alert_type}' suppressed by employee preference.")
                return
            
            # Step 3: Determine channels
            channels_to_use = set(preference.enabled_channels)
            if override_channels is not None:
                channels_to_use = channels_to_use.intersection(set(override_channels))
                
            # Step 4: Dispatch
            for channel in channels_to_use:
                try:
                    if channel == "in_app":
                        # Push via websocket
                        from app.api.events import broadcast_to_dashboards
                        await broadcast_to_dashboards({
                            "type": "NOTIFICATION",
                            "alert_type": alert_type,
                            "title": title,
                            "body": body,
                            "priority": priority,
                            "target_employee_id": str(employee_id),
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                    elif channel == "email":
                        # Enqueue celery task
                        task_send_email.delay(str(employee_id), title, body)
                    elif channel == "whatsapp" and priority in ["HIGH", "CRITICAL"]:
                        # Enqueue celery task
                        task_send_whatsapp.delay(str(employee_id), title, body)
                    
                    # Log success
                    log_entry = NotificationLog(
                        employee_id=employee_id,
                        triggered_by=alert_type,
                        title=title,
                        body=body,
                        priority=priority,
                        channel=channel,
                        status="SENT"
                    )
                    db.add(log_entry)
                except Exception as e:
                    logger.error(f"Failed to dispatch via {channel}: {e}")
                    # Log failure
                    log_entry = NotificationLog(
                        employee_id=employee_id,
                        triggered_by=alert_type,
                        title=title,
                        body=body,
                        priority=priority,
                        channel=channel,
                        status="FAILED"
                    )
                    db.add(log_entry)
                    
            await db.commit()

    except Exception as e:
        logger.error(f"Critical error in notification dispatcher: {e}")
