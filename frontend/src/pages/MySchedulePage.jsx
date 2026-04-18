/**
 * MySchedulePage — Personal schedule view for employees.
 * Shows own work schedule and leave management with calendar view.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { scheduleAPI, leaveAPI } from '../services/api';
import LeaveCalendarView from '../components/LeaveCalendarView';
import WeekScheduleView from '../components/WeekScheduleView';

export default function MySchedulePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('week');
  const [openLeaveRequestNonce, setOpenLeaveRequestNonce] = useState(0);
  const [schedules, setSchedules] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    return startOfWeek;
  });

  useEffect(() => {
    fetchData();
  }, [currentWeek, user]);

  const fetchData = async () => {
    if (!user?.employee_id) return;
    
    setLoading(true);
    try {
      const [schedRes, balanceRes] = await Promise.all([
        scheduleAPI.mySchedule({ employee_id: user.employee_id }),
        leaveAPI.getBalance()
      ]);
      setSchedules(schedRes.data || []);
      setLeaveBalance(balanceRes.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleWeekChange = (direction) => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() + (direction * 7));
    setCurrentWeek(newWeek);
  };

  const handleLeaveRequestSubmitted = () => {
    // Refresh leave balance after request submission
    fetchData();
  };

  const handleOpenLeaveRequest = () => {
    setActiveTab('calendar');
    setOpenLeaveRequestNonce((prev) => prev + 1);
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">PERSONAL</span>
          <h1 className="page-title-premium">My Schedule</h1>
          <p className="page-subtitle-premium">View your work schedule and manage leave requests</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleOpenLeaveRequest}
        >
          <span className="material-symbols-outlined">calendar_month</span>
          Leave Request
        </button>
      </header>

      {/* Tab Navigation */}
      <div className="schedule-tabs">
        <button 
          className={`schedule-tab ${activeTab === 'week' ? 'schedule-tab--active' : ''}`}
          onClick={() => setActiveTab('week')}
        >
          <span className="material-symbols-outlined">view_week</span>
          Week View
        </button>
        <button 
          className={`schedule-tab ${activeTab === 'calendar' ? 'schedule-tab--active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <span className="material-symbols-outlined">calendar_month</span>
          Leave Calendar
        </button>
      </div>

      {/* Leave Balance Sidebar */}
      {leaveBalance.length > 0 && (
        <div className="leave-balance-card glass-card">
          <h3>
            <span className="material-symbols-outlined">assignment</span>
            Leave Balance
          </h3>
          <div className="leave-balance-items">
            {leaveBalance.map((balance) => (
              <div key={balance.leave_type_id} className="leave-balance-item">
                <div className="leave-balance-header">
                  <span className="leave-type-name">{balance.leave_type_name}</span>
                  {balance.remaining_days !== null && (
                    <span className={`leave-remaining ${balance.remaining_days === 0 ? 'leave-remaining--zero' : balance.remaining_days <= 3 ? 'leave-remaining--low' : ''}`}>
                      {balance.remaining_days}/{balance.max_days}
                    </span>
                  )}
                </div>
                <div className="leave-balance-bar">
                  <div 
                    className="leave-balance-used" 
                    style={{ width: `${balance.max_days ? (balance.used_days / balance.max_days) * 100 : 0}%` }}
                  ></div>
                </div>
                <div className="leave-balance-info">
                  <span className="leave-info-label">Used: {balance.used_days} days</span>
                  {balance.max_days && <span className="leave-info-label">Total: {balance.max_days} days</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="table-loading">
          <div className="loading-spinner"></div>
          <span>Loading schedule...</span>
        </div>
      ) : (
        <>
          {activeTab === 'week' && (
            <WeekScheduleView 
              schedules={schedules}
              currentWeek={currentWeek}
              onWeekChange={handleWeekChange}
            />
          )}
          {activeTab === 'calendar' && (
            <LeaveCalendarView 
              leaveBalance={leaveBalance}
              onLeaveRequestSubmitted={handleLeaveRequestSubmitted}
              openRequestTrigger={openLeaveRequestNonce}
            />
          )}
        </>
      )}
    </div>
  );
}
