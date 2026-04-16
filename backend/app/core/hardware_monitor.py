"""
Hardware Monitoring Engine — FR13.

Monitors scanner health in real-time:
- Heartbeat tracking (every 60 seconds from device)
- Status classification: ONLINE, DEGRADED, OFFLINE
- Performance metrics: response time, error rate
- Telemetry logging to ScannerHealthLog
- Alert triggering on status changes

Background scheduler runs this every 120 seconds.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hardware import Scanner, ScannerHealthLog
from app.core.config import settings

logger = logging.getLogger("eraots.hardware_monitor")

# Configuration
HEARTBEAT_TIMEOUT_SECONDS = 300  # 5 minutes — device offline if no heartbeat
HEARTBEAT_WARNING_SECONDS = 180  # 3 minutes — device degraded if slow response
RESPONSE_TIME_DEGRADED_MS = 2000  # 2 seconds — mark as degraded
ERROR_RATE_DEGRADED_PCT = 5.0  # 5% error rate — mark as degraded


class HardwareMonitorService:
    """
    Monitors scanner health and classifies status.
    
    Hierarchy of Health Status:
    - ONLINE: Last heartbeat < 5min, response time < 2s, error rate < 5%
    - DEGRADED: Slow response OR high error rate OR missing recent heartbeat
    - OFFLINE: No heartbeat for > 5 minutes
    """

    @staticmethod
    async def check_scanner_health(
        db: AsyncSession,
        scanner: Scanner,
    ) -> tuple[str, str]:
        """
        Evaluate scanner health status.

        Returns: (new_status, reason)
            - new_status: "ONLINE", "DEGRADED", "OFFLINE"
            - reason: Human-readable explanation
        """
        if not scanner.last_heartbeat:
            return "OFFLINE", "No heartbeat recorded"

        now = datetime.now(timezone.utc)
        time_since_heartbeat = (now - scanner.last_heartbeat).total_seconds()

        # Check 1: Offline if no heartbeat for > 5 minutes
        if time_since_heartbeat > HEARTBEAT_TIMEOUT_SECONDS:
            return (
                "OFFLINE",
                f"No heartbeat for {int(time_since_heartbeat / 60)}+ minutes"
            )

        # Check 2: Get latest health log to assess performance
        health_log_result = await db.execute(
            select(ScannerHealthLog)
            .where(ScannerHealthLog.scanner_id == scanner.scanner_id)
            .order_by(ScannerHealthLog.checked_at.desc())
            .limit(1)
        )
        latest_health = health_log_result.scalar_one_or_none()

        degradation_reasons = []

        # Check 3: Response time degradation
        if latest_health and latest_health.response_time_ms:
            if latest_health.response_time_ms > RESPONSE_TIME_DEGRADED_MS:
                degradation_reasons.append(
                    f"slow response ({latest_health.response_time_ms}ms)"
                )

        # Check 4: Error rate degradation (computed from recent logs)
        error_rate = await HardwareMonitorService._get_recent_error_rate(
            db, scanner.scanner_id
        )
        if error_rate > ERROR_RATE_DEGRADED_PCT:
            degradation_reasons.append(f"high error rate ({error_rate:.1f}%)")

        # Check 5: Slow heartbeat interval (approaching timeout)
        if time_since_heartbeat > HEARTBEAT_WARNING_SECONDS:
            degradation_reasons.append("slow heartbeat")

        if degradation_reasons:
            return "DEGRADED", " + ".join(degradation_reasons)

        return "ONLINE", "All systems nominal"

    @staticmethod
    async def _get_recent_error_rate(db: AsyncSession, scanner_id: UUID) -> float:
        """
        Calculate error rate from last 10 health checks.
        Returns percentage (0-100).
        """
        result = await db.execute(
            select(ScannerHealthLog)
            .where(ScannerHealthLog.scanner_id == scanner_id)
            .order_by(ScannerHealthLog.checked_at.desc())
            .limit(10)
        )
        logs = result.scalars().all()

        if not logs:
            return 0.0

        error_count = sum(1 for log in logs if log.error_message is not None)
        return (error_count / len(logs)) * 100

    @staticmethod
    async def log_health_check(
        db: AsyncSession,
        scanner: Scanner,
        status: str,
        response_time_ms: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> ScannerHealthLog:
        """
        Record a health check result to the audit log.
        """
        health_log = ScannerHealthLog(
            scanner_id=scanner.scanner_id,
            status=status,
            response_time_ms=response_time_ms,
            error_message=error_message,
            checked_at=datetime.now(timezone.utc),
        )
        db.add(health_log)
        return health_log

    @staticmethod
    async def monitor_all_scanners(db: AsyncSession) -> dict:
        """
        Main monitoring function: Check all scanners and update their status.

        Returns:
            {
                "checked": 5,
                "online": 4,
                "degraded": 1,
                "offline": 0,
                "status_changes": [
                    {
                        "scanner_id": "...",
                        "scanner_name": "...",
                        "previous_status": "ONLINE",
                        "new_status": "DEGRADED",
                        "reason": "..."
                    }
                ]
            }
        """
        # Fetch all active scanners
        result = await db.execute(select(Scanner))
        scanners = result.scalars().all()

        summary = {
            "checked": len(scanners),
            "online": 0,
            "degraded": 0,
            "offline": 0,
            "status_changes": [],
        }

        now = datetime.now(timezone.utc)

        for scanner in scanners:
            new_status, reason = await HardwareMonitorService.check_scanner_health(
                db, scanner
            )

            # Log the health check
            await HardwareMonitorService.log_health_check(
                db, scanner, new_status, error_message=reason if new_status != "ONLINE" else None
            )

            # Track status changes
            old_status = scanner.status
            if old_status != new_status:
                summary["status_changes"].append({
                    "scanner_id": str(scanner.scanner_id),
                    "scanner_name": scanner.name,
                    "door_name": scanner.door_name,
                    "previous_status": old_status,
                    "new_status": new_status,
                    "reason": reason,
                })
                scanner.status = new_status
                logger.warning(
                    f"Scanner '{scanner.name}' status changed: {old_status} → {new_status} ({reason})"
                )

            # Update summary counts
            if new_status == "ONLINE":
                summary["online"] += 1
            elif new_status == "DEGRADED":
                summary["degraded"] += 1
            elif new_status == "OFFLINE":
                summary["offline"] += 1

        # Commit all changes
        if summary["status_changes"]:
            await db.commit()
            logger.info(
                f"Hardware monitor: {len(summary['status_changes'])} scanner(s) changed status"
            )

        return summary