import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { getOverviewStats, getSessions } from '../utils/api';

const COLORS = [
  '#00d4ff', '#ff3b5c', '#00ff88', '#ffaa00', '#aa88ff',
  '#ff6688', '#00ccaa', '#ffcc44', '#4488ff', '#ff8844',
];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function StatBox({ value, label, color }) {
  return (
    <div className="stat-box">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getOverviewStats(), getSessions()])
      .then(([ovRes, sessRes]) => {
        setOverview(ovRes.data);
        setRecentSessions(sessRes.data.slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Build pie data from recent sessions' app breakdowns
  const appData = (() => {
    const counts = {};
    recentSessions.forEach((s) => {
      // We'll just show session-level stats for now
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  const sessionBarData = recentSessions.map((s) => ({
    name: s.name.slice(0, 12),
    packets: s.totalPackets || 0,
    dropped: s.droppedPackets || 0,
  }));

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="loader" />
        <span className="text-muted mono">Initializing DPI dashboard...</span>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">// DASHBOARD</div>
        <div className="page-subtitle">Deep Packet Inspection Engine — System Overview</div>
      </div>

      <div className="page-body">
        {/* Stats Row */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <StatBox
            value={overview?.totalSessions ?? 0}
            label="Total Sessions"
            color="var(--accent)"
          />
          <StatBox
            value={overview?.totalPackets?.toLocaleString() ?? 0}
            label="Packets Analyzed"
          />
          <StatBox
            value={formatBytes(overview?.totalBytes)}
            label="Data Inspected"
          />
          <StatBox
            value={overview?.totalDropped?.toLocaleString() ?? 0}
            label="Packets Dropped"
            color="var(--danger)"
          />
          <StatBox
            value={overview?.totalForwarded?.toLocaleString() ?? 0}
            label="Packets Forwarded"
            color="var(--success)"
          />
        </div>

        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Recent Sessions Chart */}
          <div className="card">
            <div className="card-title">// Recent Sessions — Packet Volume</div>
            {sessionBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sessionBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Space Mono' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Space Mono' }}
                    axisLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      fontFamily: 'Space Mono',
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="packets" fill="var(--accent)" opacity={0.8} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="dropped" fill="var(--danger)" opacity={0.8} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-icon">◈</div>
                <div className="empty-title">No sessions yet</div>
              </div>
            )}
          </div>

          {/* Blocking Summary */}
          <div className="card">
            <div className="card-title">// Blocking Efficacy</div>
            {overview?.totalPackets > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Forwarded', value: overview.totalForwarded },
                        { name: 'Dropped', value: overview.totalDropped },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      <Cell fill="var(--success)" />
                      <Cell fill="var(--danger)" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        fontFamily: 'Space Mono',
                        fontSize: 11,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 8 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--success)', fontFamily: 'Space Mono', fontSize: '1.1rem', fontWeight: 700 }}>
                      {overview.totalForwarded?.toLocaleString()}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>FORWARDED</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: 'var(--danger)', fontFamily: 'Space Mono', fontSize: '1.1rem', fontWeight: 700 }}>
                      {overview.totalDropped?.toLocaleString()}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>DROPPED</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <div className="empty-icon">◉</div>
                <div className="empty-title">Upload a PCAP to start</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Sessions Table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>// Recent Sessions</div>
            <Link to="/sessions" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {recentSessions.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <div className="empty-icon">◈</div>
              <div className="empty-title">No sessions found</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Upload a PCAP file to begin analysis
              </div>
              <Link to="/sessions" className="btn btn-outline" style={{ marginTop: 16 }}>
                Go to Sessions
              </Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Packets</th>
                  <th>Dropped</th>
                  <th>Flows</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <Link to={`/sessions/${s._id}`} style={{ color: 'var(--accent)' }}>
                        {s.name}
                      </Link>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`status-dot ${s.status}`} />
                        {s.status}
                      </span>
                    </td>
                    <td>{s.totalPackets?.toLocaleString() || '—'}</td>
                    <td style={{ color: s.droppedPackets > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {s.droppedPackets?.toLocaleString() || '0'}
                    </td>
                    <td>{s.uniqueFlows?.toLocaleString() || '—'}</td>
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
