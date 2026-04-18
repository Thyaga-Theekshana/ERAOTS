from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from datetime import date, timedelta
from typing import List, Optional
from collections import defaultdict
import uuid
import calendar

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employee import UserAccount, Department, Employee
from app.models.attendance import AttendanceRecord
from app.models.events import OccupancyState, ScanEvent
from app.core.attendance_processor import process_daily_attendance
from app.core.attendance_schedule import (
    get_employee_schedule_for_date,
    compute_schedule_comparison,
)
from app.api.schemas import (
    PersonalInsightsResponse, PunctualityScoreResponse, DeskVsBuildingEntry,
    LateRiskPrediction, ArrivalTrendEntry, MonthlyTrendEntry,
    PersonalInsightsSummary, TeamInsightsResponse, CoverageGapKPI,
    LateClusterAlert, TeamAnomalyFeedItem,
    HeatmapCell, PolicySimPoint, DeptComparisonEntry, CompanyInsightsResponse
)

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


@router.post("/process")
async def trigger_attendance_processing(
    target_date: str = Query(...,
                             description="Date to process in YYYY-MM-DD format"),
    employee_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    On-demand attendance processing calculation.
    """
    if "HR" not in current_user.role.name and current_user.role.name != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        t_date = date.fromisoformat(target_date)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="Invalid date format. Use YYYY-MM-DD") from exc

    records = await process_daily_attendance(db, t_date, employee_id)
    return {"message": "Processing complete", "processed_records": len(records)}


@router.get("/")
async def get_attendance_records(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    employee_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    Retrieve attendance records, optionally filtered by date range and employee.
    """
    stmt = select(AttendanceRecord).options(
        joinedload(AttendanceRecord.employee))

    if start_date:
        stmt = stmt.where(AttendanceRecord.attendance_date >=
                          date.fromisoformat(start_date))
    if end_date:
        stmt = stmt.where(AttendanceRecord.attendance_date <=
                          date.fromisoformat(end_date))

    managed_dept_id = None
    if current_user.role.name == "MANAGER":
        managed_dept = (await db.execute(
            select(Department).where(
                Department.manager_id == current_user.employee_id)
        )).scalar_one_or_none()
        managed_dept_id = managed_dept.department_id if managed_dept else None

    if employee_id:
        # Check if the user is asking for their own data, or if they are HR/Admin
        if current_user.employee_id != employee_id and current_user.role.name == "EMPLOYEE":
            raise HTTPException(
                status_code=403, detail="Cannot view other employees' records")
        stmt = stmt.where(AttendanceRecord.employee_id == employee_id)
    else:
        if current_user.role.name == "EMPLOYEE":
            # Employees can only see their own records if no employee_id is specified
            stmt = stmt.where(AttendanceRecord.employee_id ==
                              current_user.employee_id)

    if department_id:
        if current_user.role.name == "EMPLOYEE":
            raise HTTPException(
                status_code=403, detail="Cannot view department attendance")
        if current_user.role.name == "MANAGER" and managed_dept_id != department_id:
            raise HTTPException(
                status_code=403, detail="Cannot view other departments")
        stmt = stmt.join(
            Employee, AttendanceRecord.employee_id == Employee.employee_id)
        stmt = stmt.where(Employee.department_id == department_id)
    elif current_user.role.name == "MANAGER" and managed_dept_id:
        stmt = stmt.join(
            Employee, AttendanceRecord.employee_id == Employee.employee_id)
        stmt = stmt.where(Employee.department_id == managed_dept_id)

    stmt = stmt.order_by(
        AttendanceRecord.attendance_date.desc(), AttendanceRecord.employee_id)

    results = (await db.execute(stmt)).scalars().all()

    schedule_cache: dict[tuple[str, str], dict] = {}
    payload = []
    for r in results:
        cache_key = (str(r.employee_id), r.attendance_date.isoformat())
        if cache_key not in schedule_cache:
            schedule = await get_employee_schedule_for_date(db, r.employee_id, r.attendance_date)
            schedule_cache[cache_key] = compute_schedule_comparison(
                r.attendance_date,
                schedule,
                r.total_productive_time_min or 0,
            )

        payload.append({
            "record_id": str(r.record_id),
            "employee_name": f"{r.employee.first_name} {r.employee.last_name}",
            "employee_id": str(r.employee_id),
            "date": r.attendance_date.isoformat(),
            "first_entry": r.first_entry.isoformat() if r.first_entry else None,
            "last_exit": r.last_exit.isoformat() if r.last_exit else None,
            "total_time_in_building_min": r.total_time_in_building_min,
            "total_active_time_min": r.total_active_time_min,
            "total_meeting_time_min": r.total_meeting_time_min,
            "total_productive_time_min": r.total_productive_time_min,
            "total_break_duration_min": r.total_break_duration_min,
            "break_count": r.break_count,
            "is_late": r.is_late,
            "late_duration_min": r.late_duration_min,
            "status": r.status,
            "overtime_duration_min": r.overtime_duration_min,
            **schedule_cache[cache_key],
        })
    return payload


# ==================== PERSONAL INSIGHTS (FR10, FR12) ====================

def _compute_punctuality_score(records: list) -> PunctualityScoreResponse:
    """Compute 0-100 punctuality score from attendance records."""
    if not records:
        return PunctualityScoreResponse()

    total_days = len(records)
    late_days = sum(1 for r in records if r.is_late)
    on_time_days = total_days - late_days
    on_time_rate = (on_time_days / total_days) * 100 if total_days > 0 else 0

    # Weighted scoring: base 100, deductions for lateness
    score = 100
    for r in records:
        if r.is_late:
            score -= 5  # -5 per late day
            late_min = r.late_duration_min or 0
            score -= min(late_min // 5, 5)  # -1 per 5 min late, max -5 extra
        if (r.total_break_duration_min or 0) > 45:
            score -= 2  # -2 per excessive break day

    score = max(0, min(100, score))

    # Calculate average late minutes
    late_records = [r for r in records if r.is_late and r.late_duration_min]
    avg_late_min = sum(r.late_duration_min for r in late_records) / \
        len(late_records) if late_records else 0

    # Calculate on-time streak (from most recent)
    streak = 0
    for r in sorted(records, key=lambda x: x.attendance_date, reverse=True):
        if not r.is_late:
            streak += 1
        else:
            break

    # Grade assignment
    if score >= 95:
        grade = "A+"
    elif score >= 85:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    # Trend: compare first half vs second half of the period
    mid = total_days // 2
    sorted_recs = sorted(records, key=lambda x: x.attendance_date)
    first_half_late = sum(1 for r in sorted_recs[:mid] if r.is_late)
    second_half_late = sum(1 for r in sorted_recs[mid:] if r.is_late)

    if mid > 0:
        first_rate = first_half_late / max(mid, 1)
        second_rate = second_half_late / max(total_days - mid, 1)
        if second_rate < first_rate - 0.1:
            trend = "IMPROVING"
        elif second_rate > first_rate + 0.1:
            trend = "DECLINING"
        else:
            trend = "STABLE"
    else:
        trend = "STABLE"

    return PunctualityScoreResponse(
        score=score,
        grade=grade,
        on_time_rate=round(on_time_rate, 1),
        late_days=late_days,
        total_days=total_days,
        trend=trend,
        avg_late_min=round(avg_late_min, 1),
        streak_on_time=streak
    )


def _compute_desk_vs_building(records: list) -> List[DeskVsBuildingEntry]:
    """Build daily desk vs building comparison data."""
    entries = []
    for r in sorted(records, key=lambda x: x.attendance_date):
        desk = r.total_active_time_min or 0
        building = r.total_time_in_building_min or 0
        breaks = r.total_break_duration_min or 0
        meeting = r.total_meeting_time_min or 0
        ratio = (desk / building * 100) if building > 0 else 0

        entries.append(DeskVsBuildingEntry(
            date=r.attendance_date,
            desk_minutes=desk,
            building_minutes=building,
            break_minutes=breaks,
            meeting_minutes=meeting,
            productivity_ratio=round(ratio, 1)
        ))
    return entries


def _compute_late_risk(records: list) -> LateRiskPrediction:
    """Predict next-day late risk based on day-of-week patterns."""
    if not records:
        return LateRiskPrediction(recommendation="No data available yet. Keep attending to build your insights!")

    # Group by day of week
    day_names = ["Monday", "Tuesday", "Wednesday",
                 "Thursday", "Friday", "Saturday", "Sunday"]
    day_stats = defaultdict(lambda: {"total": 0, "late": 0})

    for r in records:
        dow = r.attendance_date.weekday()
        day_stats[dow]["total"] += 1
        if r.is_late:
            day_stats[dow]["late"] += 1

    # Calculate risk per day
    day_risks = {}
    for dow in range(7):
        stats = day_stats[dow]
        if stats["total"] > 0:
            day_risks[day_names[dow]] = round(
                (stats["late"] / stats["total"]) * 100, 1)
        else:
            day_risks[day_names[dow]] = 0.0

    # Predict for tomorrow
    tomorrow = date.today() + timedelta(days=1)
    tomorrow_dow = tomorrow.weekday()
    tomorrow_name = day_names[tomorrow_dow]
    risk_pct = day_risks.get(tomorrow_name, 0.0)

    # Determine risk level
    if risk_pct >= 40:
        risk_level = "HIGH"
    elif risk_pct >= 25:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    # Contributing factors
    factors = []
    if risk_pct >= 25:
        factors.append(
            f"Historically late on {tomorrow_name}s {risk_pct:.0f}% of the time")

    recent_late = sum(1 for r in sorted(
        records, key=lambda x: x.attendance_date, reverse=True)[:5] if r.is_late)
    if recent_late >= 2:
        factors.append(
            f"Late {recent_late} of the last 5 days — recent pattern detected")

    avg_late_min_list = [
        r.late_duration_min for r in records if r.is_late and r.late_duration_min and r.attendance_date.weekday() == tomorrow_dow]
    if avg_late_min_list:
        avg = sum(avg_late_min_list) / len(avg_late_min_list)
        if avg > 10:
            factors.append(f"Average {avg:.0f} min late on {tomorrow_name}s")

    # Recommendation
    if risk_level == "HIGH":
        recommendation = f"⚠️ High risk for {tomorrow_name}. Consider setting an earlier alarm or preparing the night before."
    elif risk_level == "MODERATE":
        recommendation = f"Moderate risk for {tomorrow_name}. Review your recent arrival pattern and plan ahead."
    else:
        recommendation = f"Low risk for {tomorrow_name}. Keep up the good work! 🎯"

    return LateRiskPrediction(
        risk_level=risk_level,
        risk_percentage=risk_pct,
        predicted_day=tomorrow_name,
        predicted_date=tomorrow,
        contributing_factors=factors,
        recommendation=recommendation,
        day_risks=day_risks
    )


def _compute_arrival_trends(records: list) -> List[ArrivalTrendEntry]:
    """Build arrival time trend data for charting."""
    entries = []
    for r in sorted(records, key=lambda x: x.attendance_date):
        arrival_time = None
        arrival_hour = None
        if r.first_entry:
            arrival_time = r.first_entry.strftime("%I:%M %p")
            arrival_hour = r.first_entry.hour + r.first_entry.minute / 60.0

        entries.append(ArrivalTrendEntry(
            date=r.attendance_date,
            arrival_time=arrival_time,
            arrival_hour=round(arrival_hour, 2) if arrival_hour else None,
            deviation_min=r.late_duration_min or 0,
            was_late=r.is_late or False
        ))
    return entries


def _compute_monthly_trends(records: list) -> List[MonthlyTrendEntry]:
    """Aggregate records into monthly summaries."""
    monthly = defaultdict(lambda: {
        "present": 0, "late": 0, "absent": 0,
        "hours": [], "punctuality": [], "overtime": 0
    })

    for r in records:
        key = r.attendance_date.strftime("%Y-%m")
        if r.status in ("PRESENT", "HALF_DAY"):
            monthly[key]["present"] += 1
        elif r.status == "ABSENT":
            monthly[key]["absent"] += 1
        if r.is_late:
            monthly[key]["late"] += 1
        if r.total_time_in_building_min:
            monthly[key]["hours"].append(r.total_time_in_building_min / 60.0)
        if r.punctuality_score is not None:
            monthly[key]["punctuality"].append(r.punctuality_score)
        monthly[key]["overtime"] += (r.overtime_duration_min or 0)

    entries = []
    for month_key in sorted(monthly.keys()):
        data = monthly[month_key]
        yr, mo = month_key.split("-")
        month_label = f"{calendar.month_name[int(mo)]} {yr}"
        avg_hrs = sum(data["hours"]) / \
            len(data["hours"]) if data["hours"] else 0
        avg_punct = int(
            sum(data["punctuality"]) / len(data["punctuality"])) if data["punctuality"] else 0

        entries.append(MonthlyTrendEntry(
            month=month_key,
            month_label=month_label,
            present_days=data["present"],
            late_days=data["late"],
            absent_days=data["absent"],
            total_hours_worked=round(sum(data["hours"]), 1),
            avg_hours=round(avg_hrs, 1),
            avg_punctuality=avg_punct,
            total_overtime_min=data["overtime"]
        ))
    return entries


def _compute_summary(records: list) -> PersonalInsightsSummary:
    """Compute quick-glance summary statistics."""
    if not records:
        return PersonalInsightsSummary()

    # Average arrival time
    arrival_minutes = []
    for r in records:
        if r.first_entry:
            total_min = r.first_entry.hour * 60 + r.first_entry.minute
            arrival_minutes.append(total_min)

    avg_arrival_time = None
    if arrival_minutes:
        avg_min = int(sum(arrival_minutes) / len(arrival_minutes))
        h, m = divmod(avg_min, 60)
        period = "AM" if h < 12 else "PM"
        display_h = h if h <= 12 else h - 12
        if display_h == 0:
            display_h = 12
        avg_arrival_time = f"{display_h}:{m:02d} {period}"

    # Average daily hours & this month totals
    daily_hours = [r.total_time_in_building_min /
                   60.0 for r in records if r.total_time_in_building_min]
    avg_daily = sum(daily_hours) / len(daily_hours) if daily_hours else 0

    today = date.today()
    this_month_records = [r for r in records if r.attendance_date.month ==
                          today.month and r.attendance_date.year == today.year]
    this_month_hours = sum(
        r.total_time_in_building_min or 0 for r in this_month_records) / 60.0
    this_month_present = sum(
        1 for r in this_month_records if r.status in ("PRESENT", "HALF_DAY"))

    # Current on-time streak
    streak = 0
    for r in sorted(records, key=lambda x: x.attendance_date, reverse=True):
        if not r.is_late:
            streak += 1
        else:
            break

    # Best day (most productive)
    day_names = ["Monday", "Tuesday", "Wednesday",
                 "Thursday", "Friday", "Saturday", "Sunday"]
    day_hours = defaultdict(list)
    for r in records:
        if r.total_active_time_min:
            day_hours[r.attendance_date.weekday()].append(
                r.total_active_time_min)

    best_day = None
    most_productive_day = None
    if day_hours:
        day_avgs = {dow: sum(hrs) / len(hrs) for dow, hrs in day_hours.items()}
        best_dow = max(day_avgs, key=day_avgs.get)
        most_productive_day = day_names[best_dow]

        # Best day = least late
        day_late_counts = defaultdict(int)
        day_total_counts = defaultdict(int)
        for r in records:
            dow = r.attendance_date.weekday()
            day_total_counts[dow] += 1
            if r.is_late:
                day_late_counts[dow] += 1
        day_on_time_rate = {
            dow: 1 - (day_late_counts[dow] / day_total_counts[dow]) for dow in day_total_counts}
        best_dow_punctual = max(day_on_time_rate, key=day_on_time_rate.get)
        best_day = day_names[best_dow_punctual]

    return PersonalInsightsSummary(
        avg_arrival_time=avg_arrival_time,
        avg_daily_hours=round(avg_daily, 1),
        total_hours_this_month=round(this_month_hours, 1),
        days_present_this_month=this_month_present,
        current_streak=streak,
        best_day=best_day,
        most_productive_day=most_productive_day
    )


@router.get("/my-insights", response_model=PersonalInsightsResponse, tags=["Personal Insights"])
async def get_my_insights(
    days: int = Query(30, ge=7, le=180,
                      description="Number of days to analyze"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """
    Personal Insights endpoint (FR10.5, FR12.6).
    Returns punctuality score, desk vs building data, late risk prediction,
    arrival trends, monthly summaries, and quick-glance stats.
    Only returns data for the authenticated employee.
    """
    cutoff_date = date.today() - timedelta(days=days)

    stmt = (
        select(AttendanceRecord)
        .where(AttendanceRecord.employee_id == current_user.employee_id)
        .where(AttendanceRecord.attendance_date >= cutoff_date)
        .order_by(AttendanceRecord.attendance_date.asc())
    )
    results = (await db.execute(stmt)).scalars().all()

    return PersonalInsightsResponse(
        punctuality=_compute_punctuality_score(results),
        desk_vs_building=_compute_desk_vs_building(results),
        late_risk=_compute_late_risk(results),
        arrival_trends=_compute_arrival_trends(results),
        monthly_trends=_compute_monthly_trends(results),
        summary=_compute_summary(results)
    )


@router.get("/team-insights", response_model=TeamInsightsResponse, tags=["Team Insights"])
async def get_team_insights(
    days: int = Query(30, ge=7, le=120,
                      description="Number of days to analyze"),
    department_id: Optional[uuid.UUID] = Query(
        None, description="Optional department scope for HR/Admin"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user)
):
    """Department manager insights: coverage gap, late clustering alerts, anomaly feed."""
    if current_user.role.name not in ["MANAGER", "HR_MANAGER", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Resolve effective department scope
    effective_department_id = department_id
    if current_user.role.name == "MANAGER":
        managed_dept = (await db.execute(
            select(Department).where(
                Department.manager_id == current_user.employee_id)
        )).scalar_one_or_none()
        if not managed_dept:
            raise HTTPException(
                status_code=404, detail="No managed department found")
        if department_id and department_id != managed_dept.department_id:
            raise HTTPException(
                status_code=403, detail="Cannot view other departments")
        effective_department_id = managed_dept.department_id

    if not effective_department_id:
        raise HTTPException(
            status_code=400, detail="department_id is required for this role")

    # Team members in scope
    team_employees = (await db.execute(
        select(Employee).where(
            Employee.department_id == effective_department_id)
    )).scalars().all()
    team_ids = [e.employee_id for e in team_employees]
    team_name_map = {
        e.employee_id: f"{e.first_name} {e.last_name}" for e in team_employees}

    required_headcount = sum(1 for e in team_employees if e.status == "ACTIVE")

    if not team_ids:
        return TeamInsightsResponse(
            department_id=effective_department_id,
            days_analyzed=days,
            coverage=CoverageGapKPI(),
            late_clusters=[],
            anomaly_feed=[]
        )

    # Coverage gap (real-time)
    present_states = (await db.execute(
        select(OccupancyState).where(
            OccupancyState.employee_id.in_(team_ids),
            OccupancyState.current_status.in_(["ACTIVE", "IN_MEETING"])
        )
    )).scalars().all()
    present_count = len(present_states)
    gap = max(required_headcount - present_count, 0)
    coverage_rate = (present_count / required_headcount *
                     100) if required_headcount > 0 else 0
    if coverage_rate >= 95:
        coverage_status = "FULLY_COVERED"
    elif coverage_rate >= 75:
        coverage_status = "PARTIALLY_COVERED"
    else:
        coverage_status = "UNDERSTAFFED"

    cutoff_date = date.today() - timedelta(days=days)
    attendance_records = (await db.execute(
        select(AttendanceRecord)
        .options(joinedload(AttendanceRecord.employee))
        .where(AttendanceRecord.employee_id.in_(team_ids))
        .where(AttendanceRecord.attendance_date >= cutoff_date)
        .order_by(AttendanceRecord.attendance_date.desc())
    )).scalars().all()

    # Late clustering by weekday
    day_names = ["Monday", "Tuesday", "Wednesday",
                 "Thursday", "Friday", "Saturday", "Sunday"]
    weekday_totals = defaultdict(int)
    weekday_late = defaultdict(int)
    late_keys = set()

    for r in attendance_records:
        dow = r.attendance_date.weekday()
        weekday_totals[dow] += 1
        if r.is_late:
            weekday_late[dow] += 1
            late_keys.add((r.employee_id, r.attendance_date))

    late_clusters = []
    for dow in range(7):
        total = weekday_totals[dow]
        late = weekday_late[dow]
        if total == 0 or late == 0:
            continue
        rate = (late / total) * 100
        if rate >= 50:
            severity = "HIGH"
        elif rate >= 30:
            severity = "MODERATE"
        else:
            severity = "LOW"

        if severity != "LOW":
            late_clusters.append(LateClusterAlert(
                cluster_type="DAY_OF_WEEK",
                label=day_names[dow],
                occurrences=late,
                total_days=total,
                rate_pct=round(rate, 1),
                severity=severity,
                alert_message=f"{day_names[dow]} has {late}/{total} late arrivals ({rate:.0f}%)."
            ))

    # Late clustering by scanner (first IN scan of the day for late records)
    scan_events = (await db.execute(
        select(ScanEvent)
        .options(joinedload(ScanEvent.scanner))
        .where(ScanEvent.employee_id.in_(team_ids))
        .where(ScanEvent.direction == "IN")
        .where(ScanEvent.is_valid == True)
        .where(func.date(ScanEvent.scan_timestamp) >= cutoff_date)
        .order_by(ScanEvent.scan_timestamp.asc())
    )).scalars().all()

    first_in_by_day = {}
    for ev in scan_events:
        key = (ev.employee_id, ev.scan_timestamp.date())
        if key not in first_in_by_day:
            first_in_by_day[key] = ev

    scanner_late_counts = defaultdict(int)
    for key in late_keys:
        first_ev = first_in_by_day.get(key)
        if first_ev and first_ev.scanner:
            scanner_late_counts[first_ev.scanner.name] += 1

    total_late = len(late_keys)
    if total_late > 0:
        for scanner_name, count in sorted(scanner_late_counts.items(), key=lambda x: x[1], reverse=True):
            rate = (count / total_late) * 100
            if rate < 35:
                continue
            late_clusters.append(LateClusterAlert(
                cluster_type="SCANNER",
                label=scanner_name,
                occurrences=count,
                total_days=total_late,
                rate_pct=round(rate, 1),
                severity="HIGH" if rate >= 55 else "MODERATE",
                alert_message=f"{scanner_name} is associated with {count}/{total_late} late arrivals ({rate:.0f}%)."
            ))

    # Team anomaly feed
    anomaly_feed = []

    # Repeated lateness in the last 7 days
    recent_cutoff = date.today() - timedelta(days=7)
    recent_late_by_emp = defaultdict(int)
    for r in attendance_records:
        if r.attendance_date >= recent_cutoff and r.is_late:
            recent_late_by_emp[r.employee_id] += 1

    for emp_id, late_count in recent_late_by_emp.items():
        if late_count >= 3:
            anomaly_feed.append(TeamAnomalyFeedItem(
                anomaly_type="REPEATED_LATE",
                severity="HIGH",
                employee_id=emp_id,
                employee_name=team_name_map.get(emp_id),
                message=f"Late {late_count} times in the last 7 days."
            ))

    for r in attendance_records[:60]:
        employee_name = team_name_map.get(r.employee_id) or (
            f"{r.employee.first_name} {r.employee.last_name}" if r.employee else "Unknown"
        )
        if r.status in ["MISSED_SCAN", "INCOMPLETE"] or not r.first_entry or not r.last_exit:
            anomaly_feed.append(TeamAnomalyFeedItem(
                anomaly_type="MISSED_SCAN",
                severity="MEDIUM",
                employee_id=r.employee_id,
                employee_name=employee_name,
                date=r.attendance_date,
                message="Possible missed scan detected (incomplete day record)."
            ))
            continue

        if r.is_late and (r.late_duration_min or 0) >= 30:
            anomaly_feed.append(TeamAnomalyFeedItem(
                anomaly_type="EXCESSIVE_LATE",
                severity="HIGH",
                employee_id=r.employee_id,
                employee_name=employee_name,
                date=r.attendance_date,
                message=f"Arrived {(r.late_duration_min or 0)} minutes late."
            ))
            continue

        if r.first_entry and (r.first_entry.hour < 6 or r.first_entry.hour >= 11):
            anomaly_feed.append(TeamAnomalyFeedItem(
                anomaly_type="UNUSUAL_HOURS",
                severity="MEDIUM",
                employee_id=r.employee_id,
                employee_name=employee_name,
                date=r.attendance_date,
                message="Unusual first-entry hour detected."
            ))

    anomaly_feed = anomaly_feed[:20]

    return TeamInsightsResponse(
        department_id=effective_department_id,
        days_analyzed=days,
        coverage=CoverageGapKPI(
            required_headcount=required_headcount,
            actual_headcount=present_count,
            gap=gap,
            coverage_rate_pct=round(coverage_rate, 1),
            status=coverage_status
        ),
        late_clusters=late_clusters,
        anomaly_feed=anomaly_feed
    )


# ==================== COMPANY INSIGHTS (HR MANAGER, FR12) ====================

def _compute_peak_heatmap(scan_events: list) -> list:
    """Build 24×7 heatmap of IN-scan counts by hour and day-of-week (FR12.1)."""
    day_names = ["Monday", "Tuesday", "Wednesday",
                 "Thursday", "Friday", "Saturday", "Sunday"]
    counts = defaultdict(int)
    for ev in scan_events:
        dow = ev.scan_timestamp.weekday()
        hour = ev.scan_timestamp.hour
        counts[(hour, dow)] += 1

    cells = []
    for hour in range(24):
        for dow in range(7):
            cells.append(HeatmapCell(
                hour=hour,
                day_of_week=dow,
                day_name=day_names[dow],
                count=counts.get((hour, dow), 0)
            ))
    return cells


def _compute_policy_simulator(records: list) -> list:
    """Simulate late-arrival rate impact of shifting office start time.

    Baseline: 09:00 start + 15-min grace period = 09:15 cutoff.
    For offsets in [-60, -45, ..., +45, +60] minutes, counts how many
    recorded first-entry times would be flagged as late under each policy.
    Pure arithmetic — requires no external libraries.
    """
    arrivals = [
        r.first_entry.hour * 60 + r.first_entry.minute
        for r in records
        if r.first_entry is not None
    ]
    total = len(arrivals)
    if total == 0:
        return []

    base_start_min = 9 * 60  # 09:00 AM
    grace_min = 15
    current_cutoff = base_start_min + grace_min
    current_late = sum(1 for a in arrivals if a > current_cutoff)

    sim_points = []
    for offset in [-60, -45, -30, -15, 0, 15, 30, 45, 60]:
        new_start = base_start_min + offset
        cutoff = new_start + grace_min
        late_count = sum(1 for a in arrivals if a > cutoff)
        rate = round((late_count / total) * 100, 1)
        delta = late_count - current_late

        h, m = divmod(new_start, 60)
        h = max(0, min(23, h))
        period = "AM" if h < 12 else "PM"
        display_h = h if h <= 12 else h - 12
        if display_h == 0:
            display_h = 12
        time_label = f"{display_h}:{m:02d} {period}"

        if offset < 0:
            direction = f"(-{abs(offset)} min)"
        elif offset > 0:
            direction = f"(+{offset} min)"
        else:
            direction = "(current)"

        sim_points.append(PolicySimPoint(
            office_start_offset_min=offset,
            label=f"{time_label} {direction}",
            simulated_late_rate=rate,
            late_count_delta=delta
        ))
    return sim_points


def _compute_department_comparison(
    records: list,
    employee_dept_map: dict
) -> list:
    """Aggregate attendance metrics per department (FR12.4)."""
    dept_data = defaultdict(lambda: {
        "hours": [], "late": 0, "total": 0,
        "overtime": 0, "punctuality": [], "employees": set()
    })
    for r in records:
        dept_name = employee_dept_map.get(r.employee_id, "Unassigned")
        dept_data[dept_name]["total"] += 1
        dept_data[dept_name]["employees"].add(r.employee_id)
        if r.is_late:
            dept_data[dept_name]["late"] += 1
        if r.total_time_in_building_min:
            dept_data[dept_name]["hours"].append(
                r.total_time_in_building_min / 60.0)
        if r.overtime_duration_min:
            dept_data[dept_name]["overtime"] += r.overtime_duration_min
        if r.punctuality_score is not None:
            dept_data[dept_name]["punctuality"].append(r.punctuality_score)

    result = []
    for dept_name, data in sorted(dept_data.items()):
        total = data["total"]
        late_rate = round(
            (data["late"] / total) * 100, 1) if total > 0 else 0.0
        avg_hours = round(
            sum(data["hours"]) / len(data["hours"]), 1
        ) if data["hours"] else 0.0
        avg_punct = round(
            sum(data["punctuality"]) / len(data["punctuality"]), 1
        ) if data["punctuality"] else 0.0
        result.append(DeptComparisonEntry(
            department_name=dept_name,
            avg_punctuality_score=avg_punct,
            late_rate_pct=late_rate,
            avg_daily_hours=avg_hours,
            total_overtime_min=data["overtime"],
            employee_count=len(data["employees"])
        ))
    return result


@router.get(
    "/company-insights",
    response_model=CompanyInsightsResponse,
    tags=["Company Insights"]
)
async def get_company_insights(
    days: int = Query(30, ge=7, le=180,
                      description="Number of days to analyze"),
    db: AsyncSession = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """Company-wide intelligence dashboard for HR Managers (FR12.1, FR12.4).

    Returns:
    - Peak-hours heatmap: 24×7 grid of valid IN-scan counts
    - Policy impact simulation: projected late-rate for start-time shifts
    - Department comparison: punctuality, hours, overtime per department
    """
    if current_user.role.name not in ["HR_MANAGER", "SUPER_ADMIN"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    cutoff_date = date.today() - timedelta(days=days)

    # ── Peak-Hours Heatmap ─────────────────────────────────────────────────
    scan_events = (await db.execute(
        select(ScanEvent)
        .where(ScanEvent.is_valid == True)  # noqa: E712
        .where(ScanEvent.direction == "IN")
        .where(func.date(ScanEvent.scan_timestamp) >= cutoff_date)
    )).scalars().all()

    # ── Attendance records for policy sim + dept comparison ───────────────
    records = (await db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.attendance_date >= cutoff_date)
        .order_by(AttendanceRecord.attendance_date.desc())
    )).scalars().all()

    # ── Department name lookup (employee_id → dept name) ──────────────────
    departments = (await db.execute(select(Department))).scalars().all()
    dept_name_map = {d.department_id: d.name for d in departments}

    employees = (await db.execute(select(Employee))).scalars().all()
    employee_dept_map = {
        e.employee_id: dept_name_map.get(e.department_id, "Unassigned")
        for e in employees
    }

    # ── Overall late rate ─────────────────────────────────────────────────
    total_recs = len(records)
    late_recs = sum(1 for r in records if r.is_late)
    current_late_rate = round(
        (late_recs / total_recs * 100), 1) if total_recs > 0 else 0.0
    unique_employees = len({r.employee_id for r in records})

    return CompanyInsightsResponse(
        days_analyzed=days,
        heatmap=_compute_peak_heatmap(scan_events),
        policy_sim=_compute_policy_simulator(records),
        department_comparison=_compute_department_comparison(
            records, employee_dept_map),
        current_office_start="09:00",
        current_late_rate_pct=current_late_rate,
        total_employees_analyzed=unique_employees
    )
