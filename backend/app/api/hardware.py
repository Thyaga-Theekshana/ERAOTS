"""
Hardware Health Monitoring API (FR13).
Endpoints for scanner status tracking, heartbeat receiving, and health analytics.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.models.employee import UserAccount
from app.models.hardware import Scanner, ScannerHealthLog
from app.api.schemas import (
    ScannerHealthResponse,
    ScannerHealthLogResponse,
    ScannerHealthHeartbeatRequest,
    ScannerHealthStatsResponse,
)

router = APIRouter(prefix="/api/hardware", tags=["Hardware Health Monitoring"])


@router.get("/scanners/health", response_model=List[ScannerHealthResponse])
async def get_all_scanners_health(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(require_roles(["HR_MANAGER", "SUPER_ADMIN"])),
):
    """
    Get real-time health status of all scanners.
    Only accessible to HR_MANAGER and SUPER_ADMIN.
    """
    result = await db.execute(select(Scanner))
    scanners = result.scalars().all()
    
    responses = []
    for scanner in scanners:
        # Count errors today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        errors_result = await db.execute(
            select(func.count(ScannerHealthLog.log_id))
            .where(
                and_(
                    ScannerHealthLog.scanner_id == scanner.scanner_id,
                    ScannerHealthLog.checked_at >= today_start,
                    ScannerHealthLog.error_message.isnot(None),
                )
            )
        )
        error_count = errors_result.scalar() or 0
        
        # Get latest response time
        latest_log = await db.execute(
            select(ScannerHealthLog)
            .where(ScannerHealthLog.scanner_id == scanner.scanner_id)
            .order_by(ScannerHealthLog.checked_at.desc())
            .limit(1)
        )
        latest = latest_log.scalar_one_or_none()
        response_time = latest.response_time_ms if latest else None
        
        responses.append(ScannerHealthResponse(
            scanner_id=scanner.scanner_id,
            name=scanner.name,
            door_name=scanner.door_name,
            status=scanner.status,
            last_heartbeat=scanner.last_heartbeat,
            heartbeat_interval_sec=scanner.heartbeat_interval_sec,
            response_time_ms=response_time,
            error_count=error_count,
        ))
    
    return responses


@router.get("/scanners/{scanner_id}/logs", response_model=List[ScannerHealthLogResponse])
async def get_scanner_health_logs(
    scanner_id: UUID,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(require_roles(["HR_MANAGER", "SUPER_ADMIN"])),
):
    """
    Get historical health logs for a specific scanner.
    Supports trend analysis and debugging.
    """
    # Verify scanner exists
    scanner_result = await db.execute(
        select(Scanner).where(Scanner.scanner_id == scanner_id)
    )
    scanner = scanner_result.scalar_one_or_none()
    if not scanner:
        raise HTTPException(status_code=404, detail="Scanner not found")
    
    # Get logs
    logs_result = await db.execute(
        select(ScannerHealthLog)
        .where(ScannerHealthLog.scanner_id == scanner_id)
        .order_by(ScannerHealthLog.checked_at.desc())
        .limit(limit)
    )
    logs = logs_result.scalars().all()
    
    return [
        ScannerHealthLogResponse(
            log_id=log.log_id,
            scanner_id=log.scanner_id,
            status=log.status,
            response_time_ms=log.response_time_ms,
            error_message=log.error_message,
            checked_at=log.checked_at,
        )
        for log in logs
    ]


@router.post("/scanners/{scanner_id}/heartbeat", status_code=200)
async def receive_scanner_heartbeat(
    scanner_id: UUID,
    heartbeat: ScannerHealthHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive periodic heartbeat from scanner device.
    Device sends status, response time, and error info.
    """
    # Find scanner
    result = await db.execute(
        select(Scanner).where(Scanner.scanner_id == scanner_id)
    )
    scanner = result.scalar_one_or_none()
    
    if not scanner:
        raise HTTPException(status_code=404, detail="Scanner not found")
    
    # Update scanner status
    now = datetime.now(timezone.utc)
    scanner.last_heartbeat = now
    scanner.status = heartbeat.status
    
    # Log health metrics
    health_log = ScannerHealthLog(
        scanner_id=scanner_id,
        status=heartbeat.status,
        response_time_ms=heartbeat.response_time_ms,
        error_message=heartbeat.error_message,
        checked_at=now,
    )
    db.add(health_log)
    
    await db.commit()
    
    return {"status": "heartbeat_received", "timestamp": now.isoformat()}


@router.get("/scanners/stats/summary", response_model=ScannerHealthStatsResponse)
async def get_scanner_health_summary(
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(require_roles(["HR_MANAGER", "SUPER_ADMIN"])),
):
    """
    Get summary statistics for all scanners.
    Shows uptime, error rates, and performance metrics.
    """
    result = await db.execute(select(Scanner))
    scanners = result.scalars().all()
    
    total = len(scanners)
    online = sum(1 for s in scanners if s.status == "ONLINE")
    offline = sum(1 for s in scanners if s.status == "OFFLINE")
    degraded = sum(1 for s in scanners if s.status == "DEGRADED")
    
    # Calculate average response time
    logs_result = await db.execute(
        select(func.avg(ScannerHealthLog.response_time_ms))
        .where(ScannerHealthLog.response_time_ms.isnot(None))
    )
    avg_response_time = logs_result.scalar() or 0
    
    # Count errors today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    errors_result = await db.execute(
        select(func.count(ScannerHealthLog.log_id))
        .where(
            and_(
                ScannerHealthLog.checked_at >= today_start,
                ScannerHealthLog.error_message.isnot(None),
            )
        )
    )
    error_count_today = errors_result.scalar() or 0
    
    # Calculate uptime percentage
    uptime_pct = ((online + degraded) / total * 100) if total > 0 else 0
    
    return ScannerHealthStatsResponse(
        total_scanners=total,
        online=online,
        offline=offline,
        degraded=degraded,
        average_response_time_ms=float(avg_response_time),
        error_count_today=error_count_today,
        uptime_percentage=uptime_pct,
    )