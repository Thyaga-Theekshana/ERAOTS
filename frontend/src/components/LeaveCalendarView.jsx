/**
 * LeaveCalendarView — Month-based calendar for managing leave requests.
 */
import { useState, useEffect } from 'react';
import { leaveAPI } from '../services/api';
import LeaveRequestModal from './LeaveRequestModal';

export default function LeaveCalendarView({ leaveBalance, onLeaveRequestSubmitted }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthStr = currentMonth.toISOString().slice(0, 7);
      const [requestsRes, typesRes] = await Promise.all([
        leaveAPI.getCalendar(monthStr),
        leaveAPI.getTypes()
      ]);
      setLeaveRequests(requestsRes.data || []);
      setLeaveTypes(typesRes.data || []);
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

  const getLeaveForDate = (date) => {
    return leaveRequests.filter(req => {
      const reqStart = new Date(req.start_date);
      const reqEnd = new Date(req.end_date);
      return date >= reqStart && date <= reqEnd;
    });
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
              const isToday = isCurrentMonth && day === today.getDate();
              const isPastDate = date < today && !isToday;

              return (
                <div
                  key={day}
                  className={`calendar-day ${isToday ? 'calendar-day--today' : ''} ${isPastDate ? 'calendar-day--past' : ''}`}
                  onClick={() => !isPastDate && handleDateClick(day)}
                >
                  <div className="calendar-day-number">{day}</div>
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
          onClose={() => setShowModal(false)}
          onSubmit={handleLeaveSubmitted}
        />
      )}

      {/* Leave Requests List */}
      {leaveRequests.length > 0 && (
        <div className="leave-requests-list glass-card">
          <h3>
            <span className="material-symbols-outlined">assignment</span>
            Your Leave Requests
          </h3>
          <div className="requests-timeline">
            {leaveRequests.map(req => (
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
