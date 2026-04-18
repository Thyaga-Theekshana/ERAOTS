/**
 * PersonalInsightsPage — Employee Personal Performance Dashboard.
 *
 * Features (FR10.5, FR12.6):
 *  1. Punctuality Score KPI (0-100 animated ring gauge)
 *  2. Time at Desk vs. Building (grouped bar chart)
 *  3. Late Risk Predictor (day-of-week pattern analysis)
 *  4. Personal Analytics Summary (arrival trends + monthly breakdown)
 */
import { useState, useEffect, useCallback } from "react";
import { attendanceAPI } from "../services/api";
import { useUIFeedback } from '../context/UIFeedbackContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizePersonalInsights = (payload) => {
  if (!isPlainObject(payload)) {
    return null;
  }

  return {
    ...payload,
    punctuality: isPlainObject(payload.punctuality) ? payload.punctuality : {},
    late_risk: isPlainObject(payload.late_risk) ? payload.late_risk : {},
    summary: isPlainObject(payload.summary) ? payload.summary : {},
    desk_vs_building: Array.isArray(payload.desk_vs_building) ? payload.desk_vs_building : [],
    arrival_trends: Array.isArray(payload.arrival_trends) ? payload.arrival_trends : [],
    monthly_trends: Array.isArray(payload.monthly_trends) ? payload.monthly_trends : [],
  };
};

// ─── Score Ring SVG Component ──────────────────────────────────────────
function ScoreRing({ score, grade, size = 160 }) {
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const getScoreColor = (s) => {
    if (s >= 85) return "var(--status-active)";
    if (s >= 60) return "var(--status-break)";
    return "var(--primary)";
  };

  return (
    <div className="insights-score-ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--outline-variant)"
          strokeWidth="8"
          opacity="0.3"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getScoreColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="insights-score-ring-progress"
          style={{
            filter: `drop-shadow(0 0 8px ${getScoreColor(score)})`,
          }}
        />
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2 - 8}
          textAnchor="middle"
          className="insights-score-ring-value"
          fill="var(--on-surface)"
        >
          {score}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          className="insights-score-ring-label"
          fill="var(--secondary)"
        >
          / 100
        </text>
      </svg>
      <span
        className={`insights-grade-badge insights-grade-badge--${grade.replace("+", "plus")}`}
      >
        {grade}
      </span>
    </div>
  );
}

// ─── Risk Level Indicator ──────────────────────────────────────────────
function RiskIndicator({ level }) {
  const config = {
    LOW: {
      color: "var(--status-active)",
      icon: "verified_user",
      label: "Low Risk",
    },
    MODERATE: {
      color: "var(--status-break)",
      icon: "warning",
      label: "Moderate",
    },
    HIGH: { color: "var(--primary)", icon: "error", label: "High Risk" },
  };
  const c = config[level] || config.LOW;

  return (
    <div
      className="insights-risk-indicator"
      style={{ "--risk-color": c.color }}
    >
      <span
        className="material-symbols-outlined insights-risk-icon"
        style={{ color: c.color }}
      >
        {c.icon}
      </span>
      <span className="insights-risk-label" style={{ color: c.color }}>
        {c.label}
      </span>
    </div>
  );
}

// ─── Custom Tooltip for Charts ─────────────────────────────────────────
function GlassTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="insights-tooltip">
      <p className="insights-tooltip-label">{label}</p>
      {payload.map((entry, i) => (
        <p
          key={i}
          className="insights-tooltip-value"
          style={{ color: entry.color }}
        >
          <span
            className="insights-tooltip-dot"
            style={{ background: entry.color }}
          />
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────
export default function PersonalInsightsPage() {
  const ui = useUIFeedback();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await attendanceAPI.myInsights(timeRange);
      const normalized = normalizePersonalInsights(res.data);
      if (!normalized) {
        throw new Error('Unexpected personal insights response');
      }
      setData(normalized);
    } catch (err) {
      console.error("Failed to load insights:", err);
      setError("Unable to load insights. Please try again.");
      ui.error(err.response?.data?.detail || 'Unable to load insights. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const formatHour = (hour) => {
    if (hour == null) return "—";
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  };

  // Prepare chart data
  const deskChartData = (data?.desk_vs_building || []).slice(-14).map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    "Desk Time": Math.round((d.desk_minutes / 60) * 10) / 10,
    "Building Time": Math.round((d.building_minutes / 60) * 10) / 10,
    Breaks: Math.round((d.break_minutes / 60) * 10) / 10,
    ratio: d.productivity_ratio,
  }));

  const arrivalChartData = (data?.arrival_trends || []).slice(-30).map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    arrival: d.arrival_hour,
    wasLate: d.was_late,
    label: d.arrival_time || "—",
  }));

  const dayRiskData = data?.late_risk?.day_risks
    ? Object.entries(data.late_risk.day_risks).map(([day, pct]) => ({
        day: day.slice(0, 3),
        fullDay: day,
        risk: pct,
        fill:
          pct >= 40
            ? "var(--primary)"
            : pct >= 25
              ? "var(--status-break)"
              : "var(--status-active)",
      }))
    : [];

  // Loading state
  if (loading) {
    return (
      <div className="page-container">
        <header className="page-header-premium">
          <div className="page-header-content">
            <span className="page-header-chip">PERSONAL</span>
            <h1 className="page-title-premium">My Insights</h1>
            <p className="page-subtitle-premium">
              Analyzing your performance data...
            </p>
          </div>
        </header>
        <div className="insights-loading">
          <div className="loading-spinner"></div>
          <span>Crunching your numbers...</span>
        </div>
      </div>
    );
  }

  const p = data?.punctuality || {};
  const risk = data?.late_risk || {};
  const summary = data?.summary || {};

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">INTELLIGENCE</span>
          <h1 className="page-title-premium">My Insights</h1>
          <p className="page-subtitle-premium">
            Personal performance analytics &amp; predictive intelligence
          </p>
        </div>
        <div className="page-header-actions">
          <div className="insights-range-selector">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={`insights-range-btn ${timeRange === d ? "insights-range-btn--active" : ""}`}
                onClick={() => setTimeRange(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className="insights-error">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={fetchInsights}>
            Retry
          </button>
        </div>
      )}

      {/* ── Row 1: KPI Cards ───────────────────────────────── */}
      <div className="insights-kpi-row">
        {/* Punctuality Score */}
        <div className="insights-kpi-card insights-kpi-card--score">
          <div className="insights-kpi-header">
            <span className="insights-kpi-chip">PUNCTUALITY SCORE</span>
            <span
              className={`insights-trend-badge insights-trend-badge--${p.trend?.toLowerCase() || "stable"}`}
            >
              <span className="material-symbols-outlined">
                {p.trend === "IMPROVING"
                  ? "trending_up"
                  : p.trend === "DECLINING"
                    ? "trending_down"
                    : "trending_flat"}
              </span>
              {p.trend || "STABLE"}
            </span>
          </div>
          <ScoreRing score={p.score || 0} grade={p.grade || "N/A"} />
          <div className="insights-kpi-footer">
            <div className="insights-kpi-mini">
              <span className="insights-kpi-mini-value">
                {p.streak_on_time || 0}
              </span>
              <span className="insights-kpi-mini-label">Day Streak</span>
            </div>
            <div className="insights-kpi-mini">
              <span className="insights-kpi-mini-value">
                {p.late_days || 0}
              </span>
              <span className="insights-kpi-mini-label">Late Days</span>
            </div>
          </div>
        </div>

        {/* On-Time Rate */}
        <div className="insights-kpi-card">
          <span className="insights-kpi-chip">ON-TIME RATE</span>
          <div className="insights-kpi-hero">
            <span className="insights-kpi-hero-value">
              {p.on_time_rate || 0}%
            </span>
          </div>
          <div className="insights-kpi-bar-wrap">
            <div
              className="insights-kpi-bar"
              style={{ width: `${p.on_time_rate || 0}%` }}
            />
          </div>
          <span className="insights-kpi-caption">
            {p.total_days || 0} days tracked
          </span>
        </div>

        {/* Late Risk */}
        <div
          className={`insights-kpi-card insights-kpi-card--risk insights-kpi-card--risk-${risk.risk_level?.toLowerCase() || "low"}`}
        >
          <span className="insights-kpi-chip">TOMORROW'S RISK</span>
          <RiskIndicator level={risk.risk_level || "LOW"} />
          <div className="insights-kpi-hero">
            <span className="insights-kpi-hero-value insights-kpi-hero-value--sm">
              {risk.predicted_day || "—"}
            </span>
          </div>
          <span className="insights-kpi-caption">
            {risk.risk_percentage?.toFixed(0) || 0}% historical late rate
          </span>
        </div>

        {/* Average Arrival */}
        <div className="insights-kpi-card">
          <span className="insights-kpi-chip">AVG ARRIVAL</span>
          <div className="insights-kpi-hero">
            <span className="insights-kpi-hero-value">
              {summary.avg_arrival_time || "—"}
            </span>
          </div>
          <div className="insights-kpi-footer">
            <div className="insights-kpi-mini">
              <span className="insights-kpi-mini-value">
                {summary.avg_daily_hours || 0}h
              </span>
              <span className="insights-kpi-mini-label">Avg Daily</span>
            </div>
            <div className="insights-kpi-mini">
              <span className="insights-kpi-mini-value">
                {summary.current_streak || 0}
              </span>
              <span className="insights-kpi-mini-label">On-Time</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Charts ──────────────────────────────────── */}
      <div className="insights-charts-row">
        {/* Desk vs Building Chart */}
        <div className="chart-card insights-chart-card--wide">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">
                compare_arrows
              </span>
              <div>
                <h2 className="chart-card-title">Time at Desk vs. Building</h2>
                <p className="chart-card-subtitle">
                  Active hours vs total presence — last{" "}
                  {Math.min(14, deskChartData.length)} days
                </p>
              </div>
            </div>
          </div>
          <div className="chart-wrapper">
            {deskChartData.length === 0 ? (
              <div className="chart-empty">
                <span className="material-symbols-outlined">bar_chart</span>
                <p>No attendance data available yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deskChartData} barGap={2} barCategoryGap="20%">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--outline-variant)"
                    opacity={0.3}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--secondary)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--outline-variant)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--secondary)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="h"
                  />
                  <Tooltip
                    content={<GlassTooltip formatter={(v) => `${v}h`} />}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: "11px",
                      fontFamily: "var(--font-headline)",
                    }}
                  />
                  <Bar
                    dataKey="Desk Time"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="Building Time"
                    fill="var(--outline-variant)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                    opacity={0.6}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Day-of-Week Risk Heatmap */}
        <div className="chart-card insights-chart-card--narrow">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">
                calendar_view_week
              </span>
              <div>
                <h2 className="chart-card-title">Weekly Risk Map</h2>
                <p className="chart-card-subtitle">Late probability by day</p>
              </div>
            </div>
          </div>
          <div className="insights-day-risk-grid">
            {dayRiskData.map((d) => (
              <div key={d.day} className="insights-day-risk-item">
                <span className="insights-day-risk-label">{d.day}</span>
                <div className="insights-day-risk-bar-bg">
                  <div
                    className="insights-day-risk-bar-fill"
                    style={{
                      height: `${Math.max(d.risk, 4)}%`,
                      background: d.fill,
                      boxShadow: d.risk >= 25 ? `0 0 12px ${d.fill}` : "none",
                    }}
                  />
                </div>
                <span
                  className="insights-day-risk-pct"
                  style={{ color: d.fill }}
                >
                  {d.risk}%
                </span>
              </div>
            ))}
          </div>
          {risk.recommendation && (
            <div className="insights-recommendation">
              <p>{risk.recommendation}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Arrival Trends ───────────────────────────── */}
      <div className="chart-card insights-chart-card--full">
        <div className="chart-card-header">
          <div className="chart-card-title-group">
            <span className="material-symbols-outlined chart-card-icon">
              timeline
            </span>
            <div>
              <h2 className="chart-card-title">Arrival Time Trends</h2>
              <p className="chart-card-subtitle">
                Your arrival patterns over the last {arrivalChartData.length}{" "}
                days
              </p>
            </div>
          </div>
          {summary.best_day && (
            <div className="insights-best-day-chip">
              <span className="material-symbols-outlined">star</span>
              Best day: {summary.best_day}
            </div>
          )}
        </div>
        <div className="chart-wrapper">
          {arrivalChartData.length === 0 ? (
            <div className="chart-empty">
              <span className="material-symbols-outlined">show_chart</span>
              <p>No arrival data available yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arrivalChartData}>
                <defs>
                  <linearGradient
                    id="arrivalGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--outline-variant)"
                  opacity={0.3}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--secondary)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--outline-variant)" }}
                  tickLine={false}
                  interval={Math.max(
                    0,
                    Math.floor(arrivalChartData.length / 8),
                  )}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--secondary)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatHour}
                  reversed
                />
                <Tooltip
                  content={<GlassTooltip formatter={(v) => formatHour(v)} />}
                />
                <Area
                  type="monotone"
                  dataKey="arrival"
                  name="Arrival Time"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#arrivalGradient)"
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!cx || !cy) return null;
                    return (
                      <circle
                        key={`dot-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={payload.wasLate ? 5 : 3}
                        fill={
                          payload.wasLate
                            ? "var(--primary)"
                            : "var(--status-active)"
                        }
                        stroke={
                          payload.wasLate
                            ? "var(--primary)"
                            : "var(--status-active)"
                        }
                        strokeWidth={payload.wasLate ? 2 : 1}
                        style={{
                          filter: payload.wasLate
                            ? "drop-shadow(0 0 6px var(--primary))"
                            : "none",
                        }}
                      />
                    );
                  }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 4: Monthly Summary + Contributing Factors ──── */}
      <div className="insights-bottom-row">
        {/* Monthly Trend Cards */}
        <div className="insights-monthly-section">
          <h3 className="insights-section-title">
            <span className="material-symbols-outlined">calendar_month</span>
            Monthly Breakdown
          </h3>
          <div className="insights-monthly-grid">
            {(data?.monthly_trends || []).slice(-4).map((m) => (
              <div key={m.month} className="insights-monthly-card">
                <span className="insights-monthly-label">{m.month_label}</span>
                <div className="insights-monthly-stats">
                  <div className="insights-monthly-stat">
                    <span
                      className="insights-monthly-stat-value"
                      style={{ color: "var(--status-active)" }}
                    >
                      {m.present_days}
                    </span>
                    <span className="insights-monthly-stat-label">Present</span>
                  </div>
                  <div className="insights-monthly-stat">
                    <span
                      className="insights-monthly-stat-value"
                      style={{ color: "var(--status-break)" }}
                    >
                      {m.late_days}
                    </span>
                    <span className="insights-monthly-stat-label">Late</span>
                  </div>
                  <div className="insights-monthly-stat">
                    <span className="insights-monthly-stat-value">
                      {m.avg_hours}h
                    </span>
                    <span className="insights-monthly-stat-label">Avg Hrs</span>
                  </div>
                </div>
              </div>
            ))}
            {(!data?.monthly_trends || data.monthly_trends.length === 0) && (
              <div className="insights-monthly-card insights-monthly-card--empty">
                <span className="material-symbols-outlined">event_busy</span>
                <span>No monthly data yet</span>
              </div>
            )}
          </div>
        </div>

        {/* Contributing Factors / Tips */}
        <div className="insights-factors-section">
          <h3 className="insights-section-title">
            <span className="material-symbols-outlined">lightbulb</span>
            Insights &amp; Factors
          </h3>
          <div className="insights-factors-list">
            {risk.contributing_factors?.length > 0 ? (
              risk.contributing_factors.map((f, i) => (
                <div key={i} className="insights-factor-item">
                  <span className="material-symbols-outlined insights-factor-icon">
                    info
                  </span>
                  <span>{f}</span>
                </div>
              ))
            ) : (
              <div className="insights-factor-item insights-factor-item--positive">
                <span className="material-symbols-outlined insights-factor-icon">
                  check_circle
                </span>
                <span>No risk factors detected — you're on track!</span>
              </div>
            )}
            {summary.most_productive_day && (
              <div className="insights-factor-item insights-factor-item--positive">
                <span className="material-symbols-outlined insights-factor-icon">
                  emoji_events
                </span>
                <span>
                  Most productive day:{" "}
                  <strong>{summary.most_productive_day}</strong>
                </span>
              </div>
            )}
            {summary.total_hours_this_month > 0 && (
              <div className="insights-factor-item insights-factor-item--info">
                <span className="material-symbols-outlined insights-factor-icon">
                  schedule
                </span>
                <span>
                  {summary.total_hours_this_month}h logged this month across{" "}
                  {summary.days_present_this_month} days
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
