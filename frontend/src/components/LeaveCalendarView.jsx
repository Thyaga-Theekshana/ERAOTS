/**
 * LeaveCalendarView — Month-based calendar for managing leave requests.
 */
import { useState, useEffect } from 'react';
import { leaveAPI, downloadBlob } from '../services/api';
import LeaveRequestModal from './LeaveRequestModal';

export default function LeaveCalendarView({ leaveBalance, onLeaveRequestSubmitted }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [requestHistory, setRequestHistory] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [cancellingRequestId, setCancellingRequestId] = useState(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthStr = currentMonth.toISOString().slice(0, 7);
      const [requestsRes, typesRes, historyRes, holidaysRes] = await Promise.all([
        leaveAPI.getCalendar(monthStr),
        leaveAPI.getTypes(),
        leaveAPI.myRequests(),
        leaveAPI.getHolidays(monthStr),
      ]);
      setLeaveRequests(requestsRes.data || []);
      setLeaveTypes(typesRes.data || []);
      setRequestHistory(historyRes.data || []);
      setHolidays(holidaysRes.data || []);
    } catch (err) {
      console.error('Failed to fetch leave data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const toDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLeaveForDate = (date) => {
    const dateKey = toDateKey(date);
    return leaveRequests.filter(req => {
      return req.start_date <= dateKey && req.end_date >= dateKey;
    });
  };

  const getHolidayForDate = (date) => {
    const dateKey = toDateKey(date);
    return holidays.find((h) => h.holiday_date === dateKey) || null;
  };

  const handleDateClick = (day) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    setSelectedDate(date);
    setShowModal(true);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  const handleLeaveSubmitted = () => {
    setShowModal(false);
    setSelectedDate(null);
    fetchData();
    onLeaveRequestSubmitted();
  };

  const handleCancelRequest = async (requestId) => {
    setCancellingRequestId(requestId);
    try {
      await leaveAPI.cancelRequest(requestId);
      await fetchData();
      onLeaveRequestSubmitted();
    } catch (err) {
      console.error('Failed to cancel leave request:', err);
      alert(err.response?.data?.detail || 'Failed to cancel leave request');
    } finally {
      setCancellingRequestId(null);
    }
  };

  const buildDayTooltip = (holiday, leaves) => {
    const parts = [];
    if (holiday) parts.push(`Holiday: ${holiday.name}`);
    if (leaves.length > 0) {
      leaves.forEach((leave) => {
        const halfDayNote = leave.is_half_day ? ` (${leave.half_day_session || 'Half Day'})` : '';
        parts.push(`${leave.leave_type_name}: ${leave.status}${halfDayNote}`);
      });
    }
    return parts.join('\n');
  };

  const exportHistoryCsv = () => {
    if (requestHistory.length === 0) return;
    const monthParam = currentMonth.toISOString().slice(0, 7);
    leaveAPI.exportMyRequests('csv', monthParam)
      .then((res) => downloadBlob(res.data, `leave-history-${monthParam}.csv`))
      .catch((err) => {
        console.error('CSV export failed:', err);
        alert(err.response?.data?.detail || 'CSV export failed');
      });
  };

  const exportHistoryPdf = () => {
    if (requestHistory.length === 0) return;
    const monthParam = currentMonth.toISOString().slice(0, 7);
    leaveAPI.exportMyRequests('pdf', monthParam)
      .then((res) => downloadBlob(res.data, `leave-history-${monthParam}.pdf`))
      .catch((err) => {
        console.error('PDF export failed:', err);
        alert(err.response?.data?.detail || 'PDF export failed');
      });
  };

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentMonth.getFullYear() && 
                         today.getMonth() === currentMonth.getMonth();

  return (
    <div className="leave-calendar-container">
      {/* Calendar Navigation */}
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={handlePrevMonth}>
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h2 className="calendar-month-label">{monthName}</h2>
        <button className="calendar-nav-btn" onClick={handleNextMonth}>
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
        <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={handleToday}>
          Today
        </button>
        <button className="btn-secondary" onClick={exportHistoryCsv} disabled={requestHistory.length === 0}>
          <span className="material-symbols-outlined">download</span>
          Export CSV
        </button>
        <button className="btn-secondary" onClick={exportHistoryPdf} disabled={requestHistory.length === 0}>
          <span className="material-symbols-outlined">picture_as_pdf</span>
          Export PDF
        </button>
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#4CAF50' }}></span>
          <span>Approved</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#FFC107' }}></span>
          <span>Pending</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#E53935' }}></span>
          <span>Rejected</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: '#0ea5e9' }}></span>
          <span>Holiday</span>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="calendar-loading">
          <div className="loading-spinner"></div>
          <span>Loading calendar...</span>
        </div>
      ) : (
        <div className="calendar-grid glass-card">
          {/* Weekday Headers */}
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="calendar-weekday">{day}</div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="calendar-days">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="calendar-day calendar-day--empty"></div>;
              }

              const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const leaves = getLeaveForDate(date);
              const holiday = getHolidayForDate(date);
              const isToday = isCurrentMonth && day === today.getDate();
              const isPastDate = date < today && !isToday;
              const isHoliday = Boolean(holiday);

              return (
                <div
                  key={day}
                  className={`calendar-day ${isToday ? 'calendar-day--today' : ''} ${isPastDate ? 'calendar-day--past' : ''} ${isHoliday ? 'calendar-day--holiday' : ''}`}
                  onClick={() => !isPastDate && !isHoliday && handleDateClick(day)}
                  title={buildDayTooltip(holiday, leaves)}
                >
                  <div className="calendar-day-number">{day}</div>
                  {holiday && (
                    <div className="calendar-holiday-pill" title={holiday.name}>
                      {holiday.name}
                    </div>
                  )}
                  {leaves.length > 0 && (
                    <div className="calendar-day-leaves">
                      {leaves.map((leave, i) => (
                        <div
                          key={`${leave.request_id}-${i}`}
                          className={`leave-indicator leave-indicator--${leave.status.toLowerCase()}`}
                          title={`${leave.leave_type_name} - ${leave.status}`}
                        ></div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {showModal && (
        <LeaveRequestModal
          selectedDate={selectedDate}
          leaveTypes={leaveTypes}
          leaveBalance={leaveBalance}
          holidays={holidays}
          existingRequests={requestHistory}
          onClose={() => setShowModal(false)}
          onSubmit={handleLeaveSubmitted}
        />
      )}

      {/* Leave Requests List */}
      {requestHistory.length > 0 && (
        <div className="leave-requests-list glass-card">
          <h3>
            <span className="material-symbols-outlined">assignment</span>
            Leave Request History
          </h3>
          <div className="requests-timeline">
            {requestHistory.map(req => (
              <div key={req.request_id} className={`request-item request-item--${req.status.toLowerCase()}`}>
                <div className="request-header">
                  <span className="request-type">{req.leave_type_name}</span>
                  <span className={`request-status request-status--${req.status.toLowerCase()}`}>
                    {req.status}
                  </span>
                </div>
                <div className="request-dates">
                  <span className="material-symbols-outlined">calendar_range</span>
                  <span>
                    {new Date(req.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(req.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <p className="request-comment">Effective days: {req.effective_days ?? '-'}</p>
                {req.reason && <p className="request-reason">Reason: {req.reason}</p>}
                {req.review_comment && <p className="request-comment">Manager comment: {req.review_comment}</p>}
                {req.status === 'PENDING' && (
                  <div className="request-actions">
                    <button
                      className="request-cancel-btn"
                      onClick={() => handleCancelRequest(req.request_id)}
                      disabled={cancellingRequestId === req.request_id}
                    >
                      <span className="material-symbols-outlined">cancel</span>
                      {cancellingRequestId === req.request_id ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
