import { useState, useEffect } from 'react';
import { attendanceAPI, reportsAPI, downloadBlob } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

export default function AnalyticsPage() {
  const ui = useUIFeedback();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('excel');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState('attendance');
  
  // Date range for exports
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [exportStartDate, setExportStartDate] = useState(thirtyDaysAgo);
  const [exportEndDate, setExportEndDate] = useState(today);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await attendanceAPI.list();
      processMetrics(res.data);
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      setLoading(false);
    }
  };

  const processMetrics = (records) => {
    const groupedData = {};
    records.forEach(rec => {
      const date = rec.date;
      if (!groupedData[date]) {
        groupedData[date] = { date, totalWorkers: 0, lateArrivals: 0, overtimeCount: 0 };
      }
      groupedData[date].totalWorkers += 1;
      if (rec.is_late) groupedData[date].lateArrivals += 1;
      if (rec.overtime_min > 0) groupedData[date].overtimeCount += 1;
    });

    const sortedArray = Object.values(groupedData).sort((a, b) => new Date(a.date) - new Date(b.date));
    setData(sortedArray);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      let response;
      let filename;
      
      switch (exportType) {
        case 'attendance':
          response = await reportsAPI.exportAttendance(exportStartDate, exportEndDate, exportFormat);
          filename = `attendance_report_${exportStartDate}_to_${exportEndDate}`;
          break;
        case 'late-arrivals':
          response = await reportsAPI.exportLateArrivals(exportStartDate, exportEndDate, exportFormat);
          filename = `late_arrivals_${exportStartDate}_to_${exportEndDate}`;
          break;
        case 'department':
          response = await reportsAPI.exportDepartmentSummary(exportStartDate, exportEndDate, exportFormat);
          filename = `department_summary_${exportStartDate}_to_${exportEndDate}`;
          break;
        case 'employees':
          response = await reportsAPI.exportEmployees(exportFormat);
          filename = `employee_directory_${today}`;
          break;
        default:
          throw new Error('Unknown export type');
      }
      
      // Add file extension
      const ext = exportFormat === 'excel' ? '.xlsx' : exportFormat === 'pdf' ? '.pdf' : '.csv';
      downloadBlob(response.data, filename + ext);
      setShowExportModal(false);
    } catch (err) {
      console.error("Export failed:", err);
      ui.error('Failed to export report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const latest = data[data.length - 1];
  const totals = data.reduce(
    (acc, day) => {
      acc.workers += day.totalWorkers;
      acc.late += day.lateArrivals;
      acc.overtime += day.overtimeCount;
      return acc;
    },
    { workers: 0, late: 0, overtime: 0 }
  );

  const dayCount = Math.max(data.length, 1);
  const avgWorkers = Math.round(totals.workers / dayCount);
  const lateRate = totals.workers > 0 ? Math.round((totals.late / totals.workers) * 100) : 0;
  const overtimeRate = totals.workers > 0 ? Math.round((totals.overtime / totals.workers) * 100) : 0;

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">INTELLIGENCE</span>
          <h1 className="page-title-premium">Analytics</h1>
          <p className="page-subtitle-premium">Attendance intelligence and punctuality behavior over time</p>
        </div>
        <div className="page-header-actions">
          <button 
            className="btn btn-primary"
            onClick={() => setShowExportModal(true)}
          >
            <span className="material-symbols-outlined">download</span>
            Export Reports
          </button>
        </div>
      </header>

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                <span className="material-symbols-outlined">download</span>
                Export Report
              </h2>
              <button className="modal-close" onClick={() => setShowExportModal(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="modal-body">
              {/* Report Type Selection */}
              <div className="form-group">
                <label className="form-label">Report Type</label>
                <div className="export-type-grid">
                  <button 
                    className={`export-type-btn ${exportType === 'attendance' ? 'active' : ''}`}
                    onClick={() => setExportType('attendance')}
                  >
                    <span className="material-symbols-outlined">event_available</span>
                    <span>Attendance Report</span>
                  </button>
                  <button 
                    className={`export-type-btn ${exportType === 'late-arrivals' ? 'active' : ''}`}
                    onClick={() => setExportType('late-arrivals')}
                  >
                    <span className="material-symbols-outlined">schedule</span>
                    <span>Late Arrivals</span>
                  </button>
                  <button 
                    className={`export-type-btn ${exportType === 'department' ? 'active' : ''}`}
                    onClick={() => setExportType('department')}
                  >
                    <span className="material-symbols-outlined">corporate_fare</span>
                    <span>Department Summary</span>
                  </button>
                  <button 
                    className={`export-type-btn ${exportType === 'employees' ? 'active' : ''}`}
                    onClick={() => setExportType('employees')}
                  >
                    <span className="material-symbols-outlined">groups</span>
                    <span>Employee Directory</span>
                  </button>
                </div>
              </div>
              
              {/* Date Range (not for employee directory) */}
              {exportType !== 'employees' && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Date</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={exportStartDate}
                      onChange={e => setExportStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Date</label>
                    <input 
                      type="date" 
                      className="form-input"
                      value={exportEndDate}
                      onChange={e => setExportEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
              
              {/* Export Format */}
              <div className="form-group">
                <label className="form-label">Export Format</label>
                <div className="export-format-btns">
                  <button 
                    className={`format-btn ${exportFormat === 'excel' ? 'active' : ''}`}
                    onClick={() => setExportFormat('excel')}
                  >
                    <span className="material-symbols-outlined">table_chart</span>
                    Excel (.xlsx)
                  </button>
                  <button 
                    className={`format-btn ${exportFormat === 'pdf' ? 'active' : ''}`}
                    onClick={() => setExportFormat('pdf')}
                  >
                    <span className="material-symbols-outlined">picture_as_pdf</span>
                    PDF
                  </button>
                  <button 
                    className={`format-btn ${exportFormat === 'csv' ? 'active' : ''}`}
                    onClick={() => setExportFormat('csv')}
                  >
                    <span className="material-symbols-outlined">csv</span>
                    CSV
                  </button>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowExportModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <span className="loading-spinner-sm"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">download</span>
                    Download Report
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Latest Presence</span>
          <span className="stat-card-mini-value">{latest?.totalWorkers ?? 0}</span>
          <span className="stat-card-mini-caption">{latest?.date || 'No data'}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Avg Workforce</span>
          <span className="stat-card-mini-value">{avgWorkers}</span>
          <span className="stat-card-mini-caption">{data.length} tracked days</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Late Rate</span>
          <span className="stat-card-mini-value">{lateRate}%</span>
          <span className="stat-card-mini-caption">Punctuality exposure</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Overtime</span>
          <span className="stat-card-mini-value">{overtimeRate}%</span>
          <span className="stat-card-mini-caption">Extra hours logged</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-grid">
        {/* Bar Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">bar_chart</span>
              <div>
                <h2 className="chart-card-title">Daily Workforce Volume</h2>
                <p className="chart-card-subtitle">Trend Baseline</p>
              </div>
            </div>
          </div>
          <div className="chart-wrapper">
            {loading ? (
              <div className="chart-loading">
                <div className="loading-spinner"></div>
                <span>Loading chart data...</span>
              </div>
            ) : data.length === 0 ? (
              <div className="chart-empty">
                <span className="material-symbols-outlined">show_chart</span>
                <p>No data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--glass-bg)',
                      border: 'none',
                      borderRadius: '12px',
                      backdropFilter: 'blur(24px)',
                      boxShadow: 'var(--shadow-lg)'
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="totalWorkers"
                    name="Total Present"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Line Chart */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title-group">
              <span className="material-symbols-outlined chart-card-icon">trending_up</span>
              <div>
                <h2 className="chart-card-title">Punctuality Trends</h2>
                <p className="chart-card-subtitle">Risk + Load Analysis</p>
              </div>
            </div>
          </div>
          <div className="chart-wrapper">
            {loading ? (
              <div className="chart-loading">
                <div className="loading-spinner"></div>
                <span>Loading chart data...</span>
              </div>
            ) : data.length === 0 ? (
              <div className="chart-empty">
                <span className="material-symbols-outlined">show_chart</span>
                <p>No data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--glass-bg)',
                      border: 'none',
                      borderRadius: '12px',
                      backdropFilter: 'blur(24px)',
                      boxShadow: 'var(--shadow-lg)'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="lateArrivals"
                    name="Late Arrivals"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f59e0b' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="overtimeCount"
                    name="Overtime"
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#22c55e' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
