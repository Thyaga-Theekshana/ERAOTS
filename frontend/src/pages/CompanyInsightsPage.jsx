/**
 * CompanyInsightsPage — HR Manager Company-wide Intelligence Dashboard.
 *
 * Features (FR12.1, FR12.4):
 *  1. Peak-Hours Heatmap   — 24×7 color-coded grid of office entry traffic
 *  2. Policy Impact Simulator — project late-rate change vs start-time offset
 *  3. Department Comparison — punctuality / hours / overtime per department
 */
import { useState, useEffect, useCallback } from "react";
import { attendanceAPI } from "../services/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

// ─── Constants ─────────────────────────────────────────────────────────────
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHourLabel(h) {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

// ─── Glass Tooltip ──────────────────────────────────────────────────────────
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

// ─── Peak-Hours Heatmap ─────────────────────────────────────────────────────
function PeakHeatmap({ cells }) {
  const maxCount = Math.max(...cells.map((c) => c.count), 1);

  // Build hour → [dow0..dow6] lookup
  const matrix = {};
  cells.forEach((c) => {
    if (!matrix[c.hour]) matrix[c.hour] = {};
    matrix[c.hour][c.day_of_week] = c.count;
  });

  const [hovered, setHovered] = useState(null);

  return (
    <div className="ci-heatmap-wrap">
      {/* Day-of-week column headers */}
      <div className="ci-heatmap-header-row">
        <div className="ci-heatmap-corner" />
        {DAYS_SHORT.map((d) => (
          <div key={d} className="ci-heatmap-day-label">
            {d}
          </div>
        ))}
      </div>

      {/* 24 hour rows */}
      <div className="ci-heatmap-body">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="ci-heatmap-row">
            <div className="ci-heatmap-hour-label">{formatHourLabel(h)}</div>
            {Array.from({ length: 7 }, (_, dow) => {
              const count = (matrix[h] && matrix[h][dow]) || 0;
              const intensity = count / maxCount;
              const key = `${h}-${dow}`;
              return (
                <div
                  key={dow}
                  className={`ci-heatmap-cell${hovered === key ? " ci-heatmap-cell--hovered" : ""}`}
                  style={{ "--ci-intensity": intensity.toFixed(3) }}
                  title={`${DAYS_SHORT[dow]} ${formatHourLabel(h)} — ${count} scan${count !== 1 ? "s" : ""}`}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Tooltip detail */}
      {hovered && (() => {
        const [h, d] = hovered.split("-").map(Number);
        const count = (matrix[h] && matrix[h][d]) || 0;
        return (
          <div className="ci-heatmap-hover-info">
            <span className="material-symbols-outlined">schedule</span>
            <span>
              <strong>
                {DAYS_SHORT[d]} — {formatHourLabel(h)}:00
              </strong>{" "}
              · {count} check-in{count !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })()}

      {/* Gradient legend */}
      <div className="ci-heatmap-legend">
        <span className="ci-heatmap-legend-label">Low</span>
        <div className="ci-heatmap-legend-bar" />
        <span className="ci-heatmap-legend-label">Peak</span>
      </div>
    </div>
  );
}

// ─── Policy Impact Simulator ────────────────────────────────────────────────
function PolicySimulator({ simPoints, currentStart, currentLateRate }) {
  const [selectedOffset, setSelectedOffset] = useState(0);

  const selected = simPoints.find(
    (p) => p.office_start_offset_min === selectedOffset
  );

  const chartData = simPoints.map((p) => ({
    offset: p.office_start_offset_min,
    rate: p.simulated_late_rate,
    label: p.label,
  }));

  const deltaColor =
    !selected || selected.late_count_delta === 0
      ? "var(--secondary)"
      : selected.late_count_delta < 0
        ? "var(--status-active)"
        : "var(--primary)";

  const formatOffset = (v) =>
    v === 0 ? "Current" : v > 0 ? `+${v} min` : `${v} min`;

  return (
    <div className="ci-sim-wrap">
      {/* Slider */}
      <div className="ci-sim-slider-section">
        <div className="ci-sim-slider-header">
          <span className="ci-sim-slider-label">
            Shift Office Start:{" "}
            <strong style={{ color: "var(--primary)" }}>
              {formatOffset(selectedOffset)}
            </strong>
          </span>
          <span className="ci-sim-current-policy">
            Current:{" "}
            <strong>{currentStart}</strong> AM
          </span>
        </div>
        <input
          type="range"
          min={-60}
          max={60}
          step={15}
          value={selectedOffset}
          onChange={(e) => setSelectedOffset(+e.target.value)}
          className="ci-sim-slider"
        />
        <div className="ci-sim-slider-ticks">
          {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map((v) => (
            <span
              key={v}
              className={`ci-sim-tick${v === selectedOffset ? " ci-sim-tick--active" : ""}`}
              onClick={() => setSelectedOffset(v)}
            >
              {formatOffset(v)}
            </span>
          ))}
        </div>
      </div>

      {/* Result cards */}
      <div className="ci-sim-result-row">
        <div className="ci-sim-result-card">
          <span className="ci-sim-result-label">Projected Late Rate</span>
          <span
            className="ci-sim-result-value"
            style={{ color: "var(--on-surface)" }}
          >
            {selected?.simulated_late_rate ?? currentLateRate}%
          </span>
        </div>
        <div className="ci-sim-result-card">
          <span className="ci-sim-result-label">Change vs Current</span>
          <span className="ci-sim-result-value" style={{ color: deltaColor }}>
            {!selected || selected.late_count_delta === 0
              ? "—"
              : selected.late_count_delta > 0
                ? `+${selected.late_count_delta}`
                : selected.late_count_delta}{" "}
            {selected && selected.late_count_delta !== 0 ? "occurrences" : ""}
          </span>
        </div>
        <div className="ci-sim-result-card">
          <span className="ci-sim-result-label">Effective Cutoff</span>
          <span
            className="ci-sim-result-value"
            style={{ color: "var(--secondary)" }}
          >
            {selected?.label?.split(" (")[0] ?? currentStart}
          </span>
        </div>
      </div>

      {/* Projection chart */}
      <div className="ci-sim-chart-wrap">
        {simPoints.length === 0 ? (
          <div className="chart-empty">
            <span className="material-symbols-outlined">show_chart</span>
            <p>Not enough arrival data to simulate</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--outline-variant)"
                opacity={0.3}
              />
              <XAxis
                dataKey="offset"
                tick={{ fill: "var(--secondary)", fontSize: 11 }}
                axisLine={{ stroke: "var(--outline-variant)" }}
                tickLine={false}
                tickFormatter={formatOffset}
              />
              <YAxis
                tick={{ fill: "var(--secondary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="%"
                domain={[0, "auto"]}
              />
              <Tooltip
                content={
                  <GlassTooltip formatter={(v) => `${v}%`} />
                }
              />
              <ReferenceLine
                x={0}
                stroke="var(--outline-variant)"
                strokeDasharray="4 4"
                label={{
                  value: "Now",
                  fill: "var(--secondary)",
                  fontSize: 10,
                }}
              />
              {selectedOffset !== 0 && (
                <ReferenceLine
                  x={selectedOffset}
                  stroke="var(--primary)"
                  strokeWidth={2}
                />
              )}
              <Line
                type="monotone"
                dataKey="rate"
                name="Late Rate"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (!cx || !cy) return null;
                  const isSelected =
                    payload.offset === selectedOffset;
                  return (
                    <circle
                      key={`dot-${payload.offset}`}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6 : 3}
                      fill={
                        isSelected
                          ? "var(--primary)"
                          : "var(--surface-container)"
                      }
                      stroke="var(--primary)"
                      strokeWidth={2}
                      style={{
                        filter: isSelected
                          ? "drop-shadow(0 0 6px var(--primary))"
                          : "none",
                      }}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Department Comparison ──────────────────────────────────────────────────
const DEPT_METRICS = [
  {
    key: "late_rate_pct",
    label: "Late Rate",
    unit: "%",
    color: "var(--primary)",
    icon: "schedule",
  },
  {
    key: "avg_punctuality_score",
    label: "Punctuality",
    unit: "/100",
    color: "var(--status-active)",
    icon: "verified",
  },
  {
    key: "avg_daily_hours",
    label: "Avg Hours",
    unit: "h",
    color: "var(--status-meeting)",
    icon: "hourglass_bottom",
  },
];

function DeptComparison({ departments }) {
  const [metric, setMetric] = useState("late_rate_pct");
  const current = DEPT_METRICS.find((m) => m.key === metric);

  const chartData = [...departments]
    .sort((a, b) => b[metric] - a[metric])
    .map((d) => ({
      name:
        d.department_name.length > 14
          ? d.department_name.slice(0, 13) + "…"
          : d.department_name,
      fullName: d.department_name,
      value: d[metric],
      employees: d.employee_count,
    }));

  return (
    <div className="ci-dept-wrap">
      {/* Metric tabs */}
      <div className="ci-dept-tab-bar">
        {DEPT_METRICS.map((m) => (
          <button
            key={m.key}
            className={`ci-dept-tab${metric === m.key ? " ci-dept-tab--active" : ""}`}
            onClick={() => setMetric(m.key)}
          >
            <span className="material-symbols-outlined">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      <div className="ci-dept-chart-wrap">
        {departments.length === 0 ? (
          <div className="chart-empty">
            <span className="material-symbols-outlined">corporate_fare</span>
            <p>No department data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--outline-variant)"
                opacity={0.3}
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "var(--secondary)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit={current.unit}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: "var(--on-surface)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                content={
                  <GlassTooltip
                    formatter={(v) => `${v}${current.unit}`}
                  />
                }
              />
              <Bar
                dataKey="value"
                name={current.label}
                fill={current.color}
                radius={[0, 6, 6, 0]}
                maxBarSize={28}
                style={{ filter: `drop-shadow(0 0 4px ${current.color}40)` }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function CompanyInsightsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await attendanceAPI.companyInsights(timeRange);
      setData(res.data);
    } catch (err) {
      console.error("Failed to load company insights:", err);
      setError("Unable to load insights. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // ── Derived KPIs ───────────────────────────────────────────────────────
  const peakCell =
    data?.heatmap?.reduce(
      (best, c) => (c.count > (best?.count ?? 0) ? c : best),
      null
    ) ?? null;
  const peakHour = peakCell
    ? `${formatHourLabel(peakCell.hour)} ${peakCell.day_name.slice(0, 3)}`
    : "—";
  const activeDepts = data?.department_comparison?.length ?? 0;

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container">
        <header className="page-header-premium">
          <div className="page-header-content">
            <span className="page-header-chip">INTELLIGENCE</span>
            <h1 className="page-title-premium">Company Insights</h1>
            <p className="page-subtitle-premium">
              Analyzing workforce data…
            </p>
          </div>
        </header>
        <div className="insights-loading">
          <div className="loading-spinner" />
          <span>Building company intelligence…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">INTELLIGENCE</span>
          <h1 className="page-title-premium">Company Insights</h1>
          <p className="page-subtitle-premium">
            Company-wide workforce health · Peak traffic · Policy simulation
          </p>
        </div>
        <div className="page-header-actions">
          <div className="insights-range-selector">
            {[14, 30, 60].map((d) => (
              <button
                key={d}
                className={`insights-range-btn${timeRange === d ? " insights-range-btn--active" : ""}`}
                onClick={() => setTimeRange(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Error Banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="insights-error">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={fetchInsights}>
            Retry
          </button>
        </div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────────────── */}
      <div className="ci-kpi-row">
        <div className="ci-kpi-card">
          <span className="ci-kpi-icon material-symbols-outlined"
            style={{ color: "var(--primary)" }}>groups</span>
          <div className="ci-kpi-body">
            <span className="ci-kpi-chip">WORKFORCE</span>
            <span className="ci-kpi-value">
              {data?.total_employees_analyzed ?? 0}
            </span>
            <span className="ci-kpi-caption">employees tracked</span>
          </div>
        </div>

        <div className="ci-kpi-card">
          <span className="ci-kpi-icon material-symbols-outlined"
            style={{ color: "var(--status-break)" }}>schedule</span>
          <div className="ci-kpi-body">
            <span className="ci-kpi-chip">LATE RATE</span>
            <span className="ci-kpi-value">
              {data?.current_late_rate_pct ?? 0}%
            </span>
            <span className="ci-kpi-caption">last {timeRange} days</span>
          </div>
        </div>

        <div className="ci-kpi-card">
          <span className="ci-kpi-icon material-symbols-outlined"
            style={{ color: "var(--status-active)" }}>whatshot</span>
          <div className="ci-kpi-body">
            <span className="ci-kpi-chip">PEAK HOUR</span>
            <span className="ci-kpi-value ci-kpi-value--sm">{peakHour}</span>
            <span className="ci-kpi-caption">
              {peakCell ? `${peakCell.count} check-ins` : "no data"}
            </span>
          </div>
        </div>

        <div className="ci-kpi-card">
          <span className="ci-kpi-icon material-symbols-outlined"
            style={{ color: "var(--secondary)" }}>corporate_fare</span>
          <div className="ci-kpi-body">
            <span className="ci-kpi-chip">DEPARTMENTS</span>
            <span className="ci-kpi-value">{activeDepts}</span>
            <span className="ci-kpi-caption">with attendance data</span>
          </div>
        </div>
      </div>

      {/* ── Peak-Hours Heatmap ────────────────────────────────────────── */}
      <div className="chart-card ci-heatmap-card">
        <div className="chart-card-header">
          <div className="chart-card-title-group">
            <span className="material-symbols-outlined chart-card-icon">
              grid_on
            </span>
            <div>
              <h2 className="chart-card-title">Peak-Hours Heatmap</h2>
              <p className="chart-card-subtitle">
                Office entry traffic by hour &amp; day of week — last {timeRange} days
              </p>
            </div>
          </div>
          {peakCell && (
            <div className="insights-best-day-chip">
              <span className="material-symbols-outlined">whatshot</span>
              Peak: {peakCell.day_name.slice(0, 3)}{" "}
              {formatHourLabel(peakCell.hour)}:00 ({peakCell.count})
            </div>
          )}
        </div>
        {!data?.heatmap?.length ? (
          <div className="chart-empty">
            <span className="material-symbols-outlined">grid_off</span>
            <p>No scan data available for heatmap</p>
          </div>
        ) : (
          <PeakHeatmap cells={data.heatmap} />
        )}
      </div>

      {/* ── Bottom Row: Policy Sim + Dept Comparison ─────────────────── */}
      <div className="ci-bottom-grid">
        {/* Policy Simulator */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">
                tune
              </span>
              <div>
                <h2 className="chart-card-title">Policy Impact Simulator</h2>
                <p className="chart-card-subtitle">
                  How shifting start times affects late arrivals
                </p>
              </div>
            </div>
            <div
              className="insights-trend-badge"
              style={{
                background: "rgba(230,0,0,0.1)",
                color: "var(--primary)",
              }}
            >
              <span className="material-symbols-outlined">psychology</span>
              AI Insight
            </div>
          </div>
          <PolicySimulator
            simPoints={data?.policy_sim ?? []}
            currentStart={data?.current_office_start ?? "09:00"}
            currentLateRate={data?.current_late_rate_pct ?? 0}
          />
        </div>

        {/* Department Comparison */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">
                leaderboard
              </span>
              <div>
                <h2 className="chart-card-title">Department Comparison</h2>
                <p className="chart-card-subtitle">
                  Performance across {activeDepts} departments
                </p>
              </div>
            </div>
          </div>
          <DeptComparison
            departments={data?.department_comparison ?? []}
          />
        </div>
      </div>
    </div>
  );
}
