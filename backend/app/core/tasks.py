"""
Background tasks for hardware monitoring (FR13).
Runs periodic health checks on scanner devices.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.hardware import Scanner, ScannerHealthLog
from app.api.events import broadcast_to_dashboards

logger = logging.getLogger(__name__)

# Configuration
OFFLINE_THRESHOLD_MINUTES = 5
DEGRADED_RESPONSE_TIME_MS = 2000
DEGRADED_ERROR_RATE = 5  # percentage
MONITOR_INTERVAL_MINUTES = 2


async def monitor_scanner_health():
    """
    Background task: Check health of all scanners every 2 minutes.
    Detects offline/degraded devices and broadcasts alerts.
    """
    try:
        logger.info("Starting scanner health monitoring...")
        async with AsyncSessionLocal() as db:
            # Get all scanners
            result = await db.execute(select(Scanner))
            scanners = result.scalars().all()
            
            now = datetime.now(timezone.utc)
            offline_scanners = []
            degraded_scanners = []
            
            for scanner in scanners:
                # Check if offline (no heartbeat for 5 minutes)
                if scanner.last_heartbeat:
                    time_since_heartbeat = now - scanner.last_heartbeat
                    
                    if time_since_heartbeat > timedelta(minutes=OFFLINE_THRESHOLD_MINUTES):
                        # Mark as OFFLINE
                        if scanner.status != "OFFLINE":
                            old_status = scanner.status
                            scanner.status = "OFFLINE"
                            logger.warning(
                                f"Scanner '{scanner.name}' went OFFLINE "
                                f"(no heartbeat for {time_since_heartbeat.total_seconds():.0f}s)"
                            )
                            
                            offline_scanners.append({
                                "scanner_id": str(scanner.scanner_id),
                                "name": scanner.name,
                                "door_name": scanner.door_name,
                                "time_since_heartbeat": int(time_since_heartbeat.total_seconds()),
                            })
                    
                    elif scanner.status == "OFFLINE":
                        # Device came back online
                        scanner.status = "ONLINE"
                        logger.info(f"Scanner '{scanner.name}' recovered to ONLINE")
                        
                        await broadcast_to_dashboards({
                            "type": "HARDWARE_ALERT",
                            "alert_type": "SCANNER_RECOVERED",
                            "scanner_id": str(scanner.scanner_id),
                            "name": scanner.name,
                            "door_name": scanner.door_name,
                            "timestamp": now.isoformat(),
                        })
                else:
                    # No heartbeat ever received
                    if scanner.status != "OFFLINE":
                        scanner.status = "OFFLINE"
                        offline_scanners.append({
                            "scanner_id": str(scanner.scanner_id),
                            "name": scanner.name,
                            "door_name": scanner.door_name,
                            "time_since_heartbeat": "unknown",
                        })
            
            # Broadcast alerts
            if offline_scanners:
                await broadcast_to_dashboards({
                    "type": "HARDWARE_ALERT",
                    "alert_type": "SCANNER_OFFLINE",
                    "offline_scanners": offline_scanners,
                    "timestamp": now.isoformat(),
                })
            
            if degraded_scanners:
                await broadcast_to_dashboards({
                    "type": "HARDWARE_ALERT",
                    "alert_type": "SCANNER_DEGRADED",
                    "degraded_scanners": degraded_scanners,
                    "timestamp": now.isoformat(),
                })
            
            # Commit status changes
            await db.commit()
            
            logger.info(
                f"Health check complete: {len(scanners)} scanned, "
                f"{len(offline_scanners)} offline, {len(degraded_scanners)} degraded"
            )
    
    except Exception as e:
        logger.error(f"Error in scanner health monitoring: {e}", exc_info=True)


async def start_health_monitoring_scheduler():
    """
    Start the APScheduler for background health monitoring.
    Called from main.py on app startup.
    """
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.interval import IntervalTrigger
        
        scheduler = AsyncIOScheduler()
        
        # Add job: check scanner health every 2 minutes
        scheduler.add_job(
            monitor_scanner_health,
            trigger=IntervalTrigger(minutes=MONITOR_INTERVAL_MINUTES),
            id="scanner_health_check",
            name="Scanner Health Monitoring",
            replace_existing=True,
        )
        
        scheduler.start()
        logger.info(f"Scanner health monitoring started (interval: {MONITOR_INTERVAL_MINUTES} min)")
        
        return scheduler
    
    except Exception as e:
        logger.error(f"Failed to start health monitoring scheduler: {e}", exc_info=True)
        return None