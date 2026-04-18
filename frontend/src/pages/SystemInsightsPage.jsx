/**
 * SystemInsightsPage — Super Admin Full-System & Operational Intelligence.
 *
 * Features (FR13, NFR6):
 *  1. Data Quality Dashboard — scan validity, duplicates, failed events, source mix
 *  2. Hardware Health Monitoring — per-scanner status, uptime, error rates
 *  3. Security & Access Audit — unauthorized attempts, off-hours, audit feed
 */
import { useState, useEffect, useCallback } from "react";
import { systemAPI } from "../services/api";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelTime(isoString) {
  if (!isoString) return "—";
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Status Ring component ───────────────────────────────────────────────────
function StatusRing({ status }) {
  const cfg = {
    ONLINE: { color: "var(--status-active)", icon: "check_circle", label: "Online" },
    DEGRADED: { color: "var(--status-break)", icon: "warning", label: "Degraded" },
    OFFLINE: { color: "var(--primary)", icon: "error", label: "Offline" },
  }[status] ?? { color: "var(--secondary)", icon: "help", label: status };

  return (
    <span className="si-status-ring" style={{ "--si-ring-color": cfg.color }}>
      <span
        className="material-symbols-outlined si-status-icon"
        style={{ color: cfg.color }}
      >
        {cfg.icon}
      </span>
      <span className="si-status-label" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </span>
  );
}

// ─── Section 1: Data Quality ─────────────────────────────────────────────────
function DataQualityPanel({ dq }) {
  if (!dq) return null;

  const maxScannerCount = Math.max(
    ...(dq.by_scanner || []).map((s) => s.count),
    1
  );

  const sourceColors = {
    HARDWARE: "var(--status-active)",
    SIMULATOR: "var(--secondary)",
    MANUAL_CORRECTION: "var(--status-break)",
    AUTO_CHECKOUT: "var(--status-meeting)",
  };

  return (
    <div className="si-section">
      {/* KPI Cards */}
      <div className="si-kpi-row">
        <div className="si-kpi-card si-kpi-card--primary">
          <span className="material-symbols-outlined si-kpi-icon">
            fingerprint
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">TOTAL SCANS</span>
            <span className="si-kpi-value">{dq.total_scans.toLocaleString()}</span>
            <span className="si-kpi-caption">events captured</span>
          </div>
        </div>

        <div
          className="si-kpi-card"
          style={{
            borderColor:
              dq.valid_rate_pct >= 95
                ? "rgba(16, 185, 129, 0.2)"
                : dq.valid_rate_pct >= 80
                  ? "rgba(245, 158, 11, 0.2)"
                  : "rgba(230, 0, 0, 0.2)",
          }}
        >
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{
              color:
                dq.valid_rate_pct >= 95
                  ? "var(--status-active)"
                  : dq.valid_rate_pct >= 80
                    ? "var(--status-break)"
                    : "var(--primary)",
            }}
          >
            verified
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">VALID RATE</span>
            <span
              className="si-kpi-value"
              style={{
                color:
                  dq.valid_rate_pct >= 95
                    ? "var(--status-active)"
                    : dq.valid_rate_pct >= 80
                      ? "var(--status-break)"
                      : "var(--primary)",
              }}
            >
              {dq.valid_rate_pct}%
            </span>
            <span className="si-kpi-caption">{dq.valid_scans} valid scans</span>
          </div>
        </div>

        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{ color: "var(--status-break)" }}
          >
            content_copy
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">DUPLICATES</span>
            <span className="si-kpi-value">{dq.duplicate_scans}</span>
            <span className="si-kpi-caption">suppressed events</span>
          </div>
        </div>

        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{ color: "var(--primary)" }}
          >
            person_off
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">UNREGISTERED</span>
            <span
              className="si-kpi-value"
              style={{
                color:
                  dq.unregistered_attempts > 0
                    ? "var(--primary)"
                    : "var(--on-surface)",
              }}
            >
              {dq.unregistered_attempts}
            </span>
            <span className="si-kpi-caption">unknown fingerprints</span>
          </div>
        </div>
      </div>

      {/* Progress bar visual */}
      <div className="si-quality-bar-wrap">
        <div className="si-quality-bar-labels">
          <span>Scan Quality Breakdown</span>
          <span>{dq.valid_scans} valid / {dq.invalid_scans} invalid</span>
        </div>
        <div className="si-quality-bar-track">
          <div
            className="si-quality-bar-fill si-bar--valid"
            style={{
              width: `${dq.total_scans > 0 ? (dq.valid_scans / dq.total_scans) * 100 : 0}%`,
            }}
          />
          <div
            className="si-quality-bar-fill si-bar--duplicate"
            style={{
              width: `${dq.total_scans > 0 ? (dq.duplicate_scans / dq.total_scans) * 100 : 0}%`,
            }}
          />
          <div
            className="si-quality-bar-fill si-bar--unregistered"
            style={{
              width: `${dq.total_scans > 0 ? (dq.unregistered_attempts / dq.total_scans) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="si-quality-bar-legend">
          <span className="si-bar-legend-item">
            <span className="si-bar-dot si-bar-dot--valid" /> Valid
          </span>
          <span className="si-bar-legend-item">
            <span className="si-bar-dot si-bar-dot--duplicate" /> Duplicate
          </span>
          <span className="si-bar-legend-item">
            <span className="si-bar-dot si-bar-dot--unregistered" /> Unregistered
          </span>
        </div>
      </div>

      {/* By Source + By Scanner */}
      <div className="si-dq-bottom">
        {/* Source Mix */}
        <div className="si-dq-half">
          <span className="si-sub-title">Event Source Mix</span>
          <div className="si-source-list">
            {Object.entries(dq.by_source || {}).map(([src, count]) => (
              <div key={src} className="si-source-row">
                <span
                  className="si-source-dot"
                  style={{ background: sourceColors[src] || "var(--secondary)" }}
                />
                <span className="si-source-name">{src}</span>
                <span className="si-source-count">{count}</span>
                <div className="si-source-bar-bg">
                  <div
                    className="si-source-bar-fill"
                    style={{
                      width: `${(count / dq.total_scans) * 100}%`,
                      background: sourceColors[src] || "var(--secondary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-Scanner Volume */}
        <div className="si-dq-half">
          <span className="si-sub-title">Per-Scanner Volume</span>
          <div className="si-source-list">
            {(dq.by_scanner || []).map((sc) => (
              <div key={sc.scanner_name} className="si-source-row">
                <span className="material-symbols-outlined si-scanner-icon">
                  sensors
                </span>
                <span className="si-source-name">{sc.scanner_name}</span>
                <span className="si-source-count">{sc.count}</span>
                {sc.invalid_count > 0 && (
                  <span className="si-scanner-invalid-badge">
                    {sc.invalid_count} invalid
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section 2: Hardware Health ──────────────────────────────────────────────
function HardwareHealthPanel({ hw }) {
  if (!hw) return null;

  return (
    <div className="si-section">
      {/* Summary KPI strip */}
      <div className="si-kpi-row">
        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{ color: "var(--status-active)" }}
          >
            router
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">SYSTEM UPTIME</span>
            <span
              className="si-kpi-value"
              style={{ color: hw.system_uptime_pct >= 80 ? "var(--status-active)" : "var(--primary)" }}
            >
              {hw.system_uptime_pct}%
            </span>
            <span className="si-kpi-caption">
              {hw.online_count}/{hw.total_scanners} online
            </span>
          </div>
        </div>

        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{ color: "var(--secondary)" }}
          >
            speed
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">AVG RESPONSE</span>
            <span className="si-kpi-value">
              {hw.avg_response_time_ms > 0 ? `${hw.avg_response_time_ms}ms` : "—"}
            </span>
            <span className="si-kpi-caption">heartbeat latency</span>
          </div>
        </div>

        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{
              color:
                hw.offline_count > 0 ? "var(--primary)" : "var(--status-active)",
            }}
          >
            wifi_off
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">OFFLINE</span>
            <span
              className="si-kpi-value"
              style={{
                color: hw.offline_count > 0 ? "var(--primary)" : "var(--on-surface)",
              }}
            >
              {hw.offline_count}
            </span>
            <span className="si-kpi-caption">scanners unreachable</span>
          </div>
        </div>

        <div className="si-kpi-card">
          <span
            className="material-symbols-outlined si-kpi-icon"
            style={{
              color:
                hw.scanners_with_high_error_rate > 0
                  ? "var(--status-break)"
                  : "var(--status-active)",
            }}
          >
            report
          </span>
          <div className="si-kpi-body">
            <span className="si-kpi-chip">HIGH ERROR RATE</span>
            <span
              className="si-kpi-value"
              style={{
                color:
                  hw.scanners_with_high_error_rate > 0
                    ? "var(--status-break)"
                    : "var(--on-surface)",
              }}
            >
              {hw.scanners_with_high_error_rate}
            </span>
            <span className="si-kpi-caption">scanners &gt; 5% error</span>
          </div>
        </div>
      </div>

      {/* Per-scanner detail cards */}
      <div className="si-scanner-grid">
        {(hw.scanners || []).map((sc) => (
          <div key={sc.scanner_id} className="si-scanner-card">
            <div className="si-scanner-card-header">
              <div>
                <span className="si-scanner-name">{sc.name}</span>
                <span className="si-scanner-door">{sc.door_name}</span>
              </div>
              <StatusRing status={sc.status} />
            </div>

            <div className="si-scanner-metrics">
              <div className="si-scanner-metric">
                <span className="si-scanner-metric-label">Error Rate</span>
                <span
                  className="si-scanner-metric-value"
                  style={{
                    color:
                      sc.error_rate_pct > 5
                        ? "var(--status-break)"
                        : "var(--status-active)",
                  }}
                >
                  {sc.error_rate_pct}%
                </span>
              </div>
              <div className="si-scanner-metric">
                <span className="si-scanner-metric-label">Last Heartbeat</span>
                <span className="si-scanner-metric-value si-scanner-metric-value--sm">
                  {sc.last_heartbeat ? formatRelTime(sc.last_heartbeat) : "Never"}
                </span>
              </div>
            </div>

            {/* Error rate bar */}
            <div className="si-scanner-err-bar-bg">
              <div
                className="si-scanner-err-bar-fill"
                style={{
                  width: `${Math.min(sc.error_rate_pct, 100)}%`,
                  background:
                    sc.error_rate_pct > 5
                      ? "var(--status-break)"
                      : "var(--status-active)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section 3: Security & Access Audit ─────────────────────────────────────
const ALERT_META = {
  UNAUTHORIZED: {
    icon: "person_off",
    label: "Unauthorized Access",
    color: "var(--primary)",
  },
  REPEATED_UNAUTHORIZED: {
    icon: "block",
    label: "Repeated Unauthorized",
    color: "var(--primary)",
  },
  OFF_HOURS: {
    icon: "nightlight",
    label: "Off-Hours Access",
    color: "var(--status-break)",
  },
};

function SecurityAuditPanel({ alerts, auditFeed }) {
  const [activeTab, setActiveTab] = useState("alerts");

  return (
    <div className="si-section">
      <div className="si-tabs">
        <button
          className={`si-tab${activeTab === "alerts" ? " si-tab--active" : ""}`}
          onClick={() => setActiveTab("alerts")}
        >
          <span className="material-symbols-outlined">security</span>
          Security Alerts
          {alerts.length > 0 && (
            <span className="si-tab-badge">{alerts.length}</span>
          )}
        </button>
        <button
          className={`si-tab${activeTab === "audit" ? " si-tab--active" : ""}`}
          onClick={() => setActiveTab("audit")}
        >
          <span className="material-symbols-outlined">history</span>
          Audit Feed
          {auditFeed.length > 0 && (
            <span className="si-tab-badge si-tab-badge--neutral">
              {auditFeed.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "alerts" && (
        <div className="si-feed-list">
          {alerts.length === 0 ? (
            <div className="si-feed-empty">
              <span className="material-symbols-outlined">shield</span>
              <p>No security alerts in this period — all clear ✓</p>
            </div>
          ) : (
            alerts.map((alert, i) => {
              const meta = ALERT_META[alert.alert_type] ?? {
                icon: "warning",
                label: alert.alert_type,
                color: "var(--secondary)",
              };
              return (
                <div
                  key={i}
                  className={`si-feed-item si-feed-item--${alert.severity.toLowerCase()}`}
                >
                  <span
                    className="material-symbols-outlined si-feed-icon"
                    style={{ color: meta.color }}
                  >
                    {meta.icon}
                  </span>
                  <div className="si-feed-body">
                    <div className="si-feed-row">
                      <span className="si-feed-title">{meta.label}</span>
                      <span
                        className={`si-severity-badge si-severity-badge--${alert.severity.toLowerCase()}`}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <span className="si-feed-sub">
                      {alert.scanner_name} · {alert.door_name} ·{" "}
                      <code className="si-fp-hint">{alert.fingerprint_hint}</code>
                    </span>
                    <span className="si-feed-time">
                      {formatTime(alert.scan_timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="si-feed-list">
          {auditFeed.length === 0 ? (
            <div className="si-feed-empty">
              <span className="material-symbols-outlined">history_toggle_off</span>
              <p>No audit events in this period</p>
            </div>
          ) : (
            auditFeed.map((entry) => (
              <div key={String(entry.audit_id)} className="si-feed-item">
                <span
                  className="material-symbols-outlined si-feed-icon"
                  style={{ color: "var(--secondary)" }}
                >
                  {entry.action === "LOGIN"
                    ? "login"
                    : entry.action === "CREATE"
                      ? "add_circle"
                      : entry.action === "DELETE"
                        ? "delete"
                        : entry.action === "UPDATE"
                          ? "edit"
                          : "receipt_long"}
                </span>
                <div className="si-feed-body">
                  <div className="si-feed-row">
                    <span className="si-feed-title">
                      {entry.action} · {entry.entity_type}
                    </span>
                  </div>
                  <span className="si-feed-sub">
                    {entry.actor_name ?? "System"}{" "}
                    {entry.ip_address ? `· ${entry.ip_address}` : ""}
                  </span>
                  <span className="si-feed-time">
                    {formatTime(entry.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SystemInsightsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(7);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await systemAPI.insights(timeRange);
      setData(res.data);
    } catch (err) {
      console.error("Failed to load system insights:", err);
      setError("Unable to load system insights. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const criticalAlerts = data?.security_alerts?.filter(
    (a) => a.severity === "CRITICAL"
  ).length ?? 0;

  if (loading) {
    return (
      <div className="page-container">
        <header className="page-header-premium">
          <div className="page-header-content">
            <span className="page-header-chip">SUPER ADMIN</span>
            <h1 className="page-title-premium">System Insights</h1>
            <p className="page-subtitle-premium">Scanning system health…</p>
          </div>
        </header>
        <div className="insights-loading">
          <div className="loading-spinner" />
          <span>Scanning system health…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">SUPER ADMIN</span>
          <h1 className="page-title-premium">System Insights</h1>
          <p className="page-subtitle-premium">
            Data quality · Hardware health · Security &amp; access audit
          </p>
        </div>
        <div className="page-header-actions">
          {criticalAlerts > 0 && (
            <div className="si-critical-banner">
              <span className="material-symbols-outlined">emergency</span>
              {criticalAlerts} critical alert{criticalAlerts > 1 ? "s" : ""}
            </div>
          )}
          <div className="insights-range-selector">
            {[7, 14, 30].map((d) => (
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

      {error && (
        <div className="insights-error">
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={fetchInsights}>
            Retry
          </button>
        </div>
      )}

      {/* ── 1. Data Quality ──────────────────────────────────────────── */}
      <div className="chart-card si-panel-card">
        <div className="chart-card-header">
          <div className="chart-card-title-group">
            <span className="material-symbols-outlined chart-card-icon">
              fact_check
            </span>
            <div>
              <h2 className="chart-card-title">Data Quality Dashboard</h2>
              <p className="chart-card-subtitle">
                Scan integrity metrics · Last {timeRange} days ·{" "}
                {data?.data_quality?.total_scans ?? 0} total events
              </p>
            </div>
          </div>
          {data?.data_quality?.valid_rate_pct >= 95 ? (
            <div
              className="insights-trend-badge insights-trend-badge--improving"
            >
              <span className="material-symbols-outlined">check_circle</span>
              Healthy
            </div>
          ) : (
            <div
              className="insights-trend-badge insights-trend-badge--declining"
            >
              <span className="material-symbols-outlined">warning</span>
              Needs Attention
            </div>
          )}
        </div>
        <DataQualityPanel dq={data?.data_quality} />
      </div>

      {/* ── 2. Hardware Health ───────────────────────────────────────── */}
      <div className="chart-card si-panel-card">
        <div className="chart-card-header">
          <div className="chart-card-title-group">
            <span className="material-symbols-outlined chart-card-icon">
              monitor_heart
            </span>
            <div>
              <h2 className="chart-card-title">Hardware Health Monitoring</h2>
              <p className="chart-card-subtitle">
                {data?.hardware_health?.total_scanners ?? 0} registered scanners ·
                Real-time status
              </p>
            </div>
          </div>
          {data?.hardware_health?.offline_count > 0 && (
            <div
              className="insights-trend-badge insights-trend-badge--declining"
            >
              <span className="material-symbols-outlined">wifi_off</span>
              {data.hardware_health.offline_count} Offline
            </div>
          )}
        </div>
        <HardwareHealthPanel hw={data?.hardware_health} />
      </div>

      {/* ── 3. Security & Audit ──────────────────────────────────────── */}
      <div className="chart-card si-panel-card">
        <div className="chart-card-header">
          <div className="chart-card-title-group">
            <span className="material-symbols-outlined chart-card-icon">
              shield
            </span>
            <div>
              <h2 className="chart-card-title">Security &amp; Access Audit</h2>
              <p className="chart-card-subtitle">
                Unauthorized attempts · Off-hours access · Admin action log
              </p>
            </div>
          </div>
          {criticalAlerts > 0 && (
            <div
              className="insights-trend-badge insights-trend-badge--declining"
            >
              <span className="material-symbols-outlined">lock_open</span>
              {criticalAlerts} Critical
            </div>
          )}
        </div>
        <SecurityAuditPanel
          alerts={data?.security_alerts ?? []}
          auditFeed={data?.audit_feed ?? []}
        />
      </div>
    </div>
  );
}
