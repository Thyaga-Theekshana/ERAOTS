import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00c49f', '#ffbb28'];

export default function NotificationAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    notificationsAPI.getAnalytics()
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="skeleton" style={{ height: '300px', borderRadius: '12px', gridColumn: 'span 12' }}></div>;
  }

  if (error || !data) {
    return (
      <div className="bento-events-card" style={{ gridColumn: 'span 12', marginTop: '1rem', padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '32px', marginBottom: '8px' }}>error_outline</span>
        <p>Failed to load notification analytics.</p>
      </div>
    );
  }

  const pieData = Object.entries(data.by_type || {}).map(([key, value]) => ({
    name: key.replace('_', ' '),
    value
  }));

  return (
    <div className="bento-events-card" style={{ gridColumn: 'span 12', marginTop: '1rem' }}>
      <div className="bento-events-header">
        <h3 className="bento-events-title">Alert & Notification Telemetry</h3>
        <span className="bento-events-badge">Today</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px', padding: '20px' }}>
        
        {/* Metric Cards */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)' }}>{data.total_sent_today}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Notifications Dispatched</div>
          </div>

          <div className="glass-card" style={{ padding: '20px', textAlign: 'center', position: 'relative' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>{data.suppressed_today}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Alerts Suppressed
              <span className="material-symbols-outlined" title="Alerts not sent because employees were on approved leave or it was a holiday" style={{ fontSize: '14px', cursor: 'help' }}>info</span>
            </div>
          </div>

        </div>

        {/* Pie Chart */}
        <div className="glass-card" style={{ gridColumn: 'span 4', height: '220px', padding: '10px' }}>
          <h4 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Type Breakdown</h4>
          {pieData.length === 0 ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No alerts sent today</div>
          ) : (
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5}>
                  {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Employees */}
        <div className="glass-card" style={{ gridColumn: 'span 4', padding: '16px', overflowY: 'auto', maxHeight: '220px' }}>
          <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Most Alerted Staff (Week)</h4>
          {(!data.top_alerted_employees || data.top_alerted_employees.length === 0) ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>No actionable data.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.top_alerted_employees.map((emp, idx) => (
                <div 
                  key={idx} 
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', cursor: 'pointer' }}
                  onClick={() => navigate(`/employees/${emp.employee_id}`)}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{emp.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{emp.most_common_type}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                    {emp.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
