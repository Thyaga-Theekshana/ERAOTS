/**
 * Dashboard Page — FR3: Live real-time occupancy view.
 */
import { useState, useEffect } from 'react';
import { eventsAPI, createDashboardSocket } from '../services/api';

export default function DashboardPage() {
  const [occupancy, setOccupancy] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [occRes, eventsRes] = await Promise.all([
          eventsAPI.occupancy(),
          eventsAPI.recent(20),
        ]);
        setOccupancy(occRes.data);
        setRecentEvents(eventsRes.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = createDashboardSocket((data) => {
      if (data.type === 'SCAN_EVENT') {
        // Add to live feed
        setRecentEvents((prev) => [{
          event_id: Date.now(),
          employee_name: data.employee_name,
          direction: data.direction,
          door_name: data.door,
          scan_timestamp: data.timestamp,
          is_valid: true,
        }, ...prev.slice(0, 49)]);

        // Refresh occupancy
        eventsAPI.occupancy().then(res => setOccupancy(res.data));
      }
    });

    return () => ws.close();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
      </div>
    );
  }

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Dashboard</h1>
          <p className="page-subtitle">Real-time office occupancy and activity</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="status-dot active" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Live</span>
        </div>
      </div>

      {/* Occupancy Stats */}
      <div className="stats-grid">
        <div className="stat-card total">
          <span className="stat-label">Total Inside</span>
          <span className="stat-value">{occupancy?.total_inside ?? 0}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            of {occupancy?.total_capacity ?? 0} capacity ({occupancy?.occupancy_percentage ?? 0}%)
          </span>
        </div>
        <div className="stat-card active">
          <span className="stat-label">Active</span>
          <span className="stat-value" style={{ color: 'var(--active)' }}>{occupancy?.active_count ?? 0}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Currently working</span>
        </div>
        <div className="stat-card on-break">
          <span className="stat-label">On Break</span>
          <span className="stat-value" style={{ color: 'var(--on-break)' }}>{occupancy?.on_break_count ?? 0}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Outside &lt; 30 min</span>
        </div>
        <div className="stat-card away">
          <span className="stat-label">Away</span>
          <span className="stat-value" style={{ color: 'var(--away)' }}>{occupancy?.away_count ?? 0}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Outside &gt; 30 min</span>
        </div>
      </div>

      {/* Live Event Feed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Live Activity Feed</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            {recentEvents.length} recent events
          </span>
        </div>
        <div className="live-feed">
          {recentEvents.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No scan events yet. Start the simulator to see live data.
            </p>
          ) : (
            recentEvents.map((event, idx) => (
              <div key={event.event_id || idx} className={`feed-item ${event.direction === 'IN' ? 'entry' : 'exit'}`}>
                <span className={`feed-direction ${event.direction?.toLowerCase()}`}>
                  {event.direction === 'IN' ? '>>>' : '<<<'}
                </span>
                <div>
                  <div className="feed-name">{event.employee_name || 'Unknown'}</div>
                  <div className="feed-meta">{event.door_name || 'Unknown Door'}</div>
                </div>
                <span className="feed-time">{formatTime(event.scan_timestamp)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
