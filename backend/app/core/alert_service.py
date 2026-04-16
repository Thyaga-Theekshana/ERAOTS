"""
Intelligent Alert Service — FR13.

Generates alerts for:
- CRITICAL: Scanner offline > 5 minutes
- WARNING: Scanner degraded, high error rate, slow response
- INFO: Recovery events, system status changes

Delivery channels:
- WebSocket (real-time dashboard)
- Database (audit trail)
- Notifications (in-app + email)
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notifications import Notification
from app.models.hardware import Scanner

logger = logging.getLogger("eraots.alert_service")


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class AlertType(str, Enum):
    """Alert categories."""
    SCANNER_OFFLINE = "SCANNER_OFFLINE"
    SCANNER_DEGRADED = "SCANNER_DEGRADED"
    SCANNER_RECOVERED = "SCANNER_RECOVERED"
    HIGH_ERROR_RATE = "HIGH_ERROR_RATE"
    SLOW_RESPONSE = "SLOW_RESPONSE"
    BUFFER_OVERFLOW = "BUFFER_OVERFLOW"
    UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS"


class HardwareAlertService:
    """
    Enterprise alert generation and routing.
    """

    @staticmethod
    async def trigger_alert(
        db: AsyncSession,
        alert_type: AlertType,
        severity: AlertSeverity,
        scanner: Optional[Scanner] = None,
        title: str = "",
        message: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Notification:
        """
        Create and broadcast an alert.

        Args:
            db: Database session
            alert_type: Category of alert
            severity: CRITICAL, WARNING, or INFO
            scanner: Related scanner (if applicable)
            title: Alert title
            message: Alert message
            metadata: Additional context

        Returns:
            Notification object (for WebSocket broadcasting)
        """
        now = datetime.now(timezone.utc)

        # Determine priority based on severity
        priority_map = {
            AlertSeverity.CRITICAL: "CRITICAL",
            AlertSeverity.WARNING: "HIGH",
            AlertSeverity.INFO: "MEDIUM",
        }

        # Construct notification details
        full_title = title or f"{alert_type.value}: {severity.value}"
        full_message = message or f"Hardware alert detected: {alert_type.value}"

        if scanner:
            full_message += f" (Scanner: {scanner.name} - {scanner.door_name})"

        # Create notification for SUPER_ADMIN and HR_MANAGER users
        # (Broadcasts to admin dashboard)
        notification = Notification(
            recipient_id=None,  # Admin broadcast notification
            title=full_title,
            message=full_message,
            type="HARDWARE_ALERT",
            channel="IN_APP",
            priority=priority_map[severity],
            is_actionable=False,
            delivery_status="DELIVERED",
        )

        # Attach metadata for dashboard rendering
        notification.action_metadata = {
            "alert_type": alert_type.value,
            "severity": severity.value,
            "scanner_id": str(scanner.scanner_id) if scanner else None,
            "scanner_name": scanner.name if scanner else None,
            "door_name": scanner.door_name if scanner else None,
            "triggered_at": now.isoformat(),
            **(metadata or {}),
        }

        db.add(notification)
        await db.flush()

        logger.info(
            f"Alert triggered: {alert_type.value} ({severity.value}) - {full_message}"
        )

        return notification

    @staticmethod
    async def alert_scanner_offline(
        db: AsyncSession,
        scanner: Scanner,
        minutes_offline: int,
    ) -> Notification:
        """Alert: Scanner has been offline for N minutes."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.SCANNER_OFFLINE,
            severity=AlertSeverity.CRITICAL,
            scanner=scanner,
            title=f"⚠️ Critical: Scanner Offline",
            message=f"Scanner has been offline for {minutes_offline} minutes. "
            f"Biometric scans cannot be processed.",
            metadata={
                "minutes_offline": minutes_offline,
                "requires_action": True,
            },
        )

    @staticmethod
    async def alert_scanner_degraded(
        db: AsyncSession,
        scanner: Scanner,
        reasons: List[str],
    ) -> Notification:
        """Alert: Scanner is degraded (slow/high error rate)."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.SCANNER_DEGRADED,
            severity=AlertSeverity.WARNING,
            scanner=scanner,
            title=f"⚠️ Warning: Scanner Degraded",
            message=f"Scanner performance is degraded: {', '.join(reasons)}. "
            f"Service is operational but may be slow.",
            metadata={
                "degradation_reasons": reasons,
            },
        )

    @staticmethod
    async def alert_scanner_recovered(
        db: AsyncSession,
        scanner: Scanner,
        previous_status: str,
    ) -> Notification:
        """Alert: Scanner recovered from offline/degraded."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.SCANNER_RECOVERED,
            severity=AlertSeverity.INFO,
            scanner=scanner,
            title=f"✅ Scanner Recovered",
            message=f"Scanner has recovered from {previous_status} status. "
            f"All systems operational.",
            metadata={
                "previous_status": previous_status,
                "recovered_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    @staticmethod
    async def alert_high_error_rate(
        db: AsyncSession,
        scanner: Scanner,
        error_rate_pct: float,
    ) -> Notification:
        """Alert: Scanner has high error rate."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.HIGH_ERROR_RATE,
            severity=AlertSeverity.WARNING,
            scanner=scanner,
            title=f"⚠️ High Error Rate Detected",
            message=f"Scanner is experiencing {error_rate_pct:.1f}% error rate in recent checks. "
            f"Consider restarting the device.",
            metadata={
                "error_rate_pct": error_rate_pct,
            },
        )

    @staticmethod
    async def alert_slow_response(
        db: AsyncSession,
        scanner: Scanner,
        response_time_ms: int,
    ) -> Notification:
        """Alert: Scanner response time is slow."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.SLOW_RESPONSE,
            severity=AlertSeverity.WARNING,
            scanner=scanner,
            title=f"⚠️ Slow Response Time",
            message=f"Scanner is responding slowly ({response_time_ms}ms). "
            f"May indicate network or hardware issues.",
            metadata={
                "response_time_ms": response_time_ms,
            },
        )

    @staticmethod
    async def alert_unauthorized_access(
        db: AsyncSession,
        scanner: Scanner,
        fingerprint_id: str,
    ) -> Notification:
        """Alert: Unauthorized biometric access attempt."""
        return await HardwareAlertService.trigger_alert(
            db=db,
            alert_type=AlertType.UNAUTHORIZED_ACCESS,
            severity=AlertSeverity.WARNING,
            scanner=scanner,
            title=f"🚨 Unauthorized Access Attempt",
            message=f"Unknown fingerprint scanned. Access denied.",
            metadata={
                "fingerprint_id": fingerprint_id,
            },
        )
        