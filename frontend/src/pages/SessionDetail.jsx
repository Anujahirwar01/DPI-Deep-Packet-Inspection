import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from 'recharts';
import {
  getSession, getPackets, getFlows, getPacketAppBreakdown,
  getTopTalkers, getTimeline, getProtocolBreakdown,
} from '../utils/api';

const APP_COLORS = {
  YOUTUBE: '#ff0000', FACEBOOK: '#1877f2', NETFLIX: '#e50914',
  TIKTOK: '#69c9d0', GOOGLE: '#4285f4', GITHUB: '#e6edf3',
  AMAZON: '#ff9900', MICROSOFT: '#00a4ef', APPLE: '#a2aaad',
  CLOUDFLARE: '#f38020', HTTPS: '#00d4ff', HTTP: '#7aa8cc',
  DNS: '#ffaa00', UNKNOWN: '#3a5a7a',
};

const TABS = ['Packets', 'Flows', 'App Traffic', 'SNI / Domains', 'Top Talkers', 'Timeline'];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function AppBadge({ type }) {
  const color = APP_COLORS[type] || 'var(--text-muted)';
  return (
    <span className="badge" style={{
      background: `${color}15`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {type}
    </span>
  );
}

export default function SessionDetail() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('Packets');

  // Data
  const [packets, setPackets] = useState([]);
  const [packetTotal, setPacketTotal] = useState(0);
  const [packetPage, setPacketPage] = useState(1);
  const [packetPages, setPacketPages] = useState(1);
  const [packetFilter, setPacketFilter] = useState({ appType: '', blocked: '' });
  const [packetsLoading, setPacketsLoading] = useState(false);

  const [flows, setFlows] = useState([]);
  const [flowTotal, setFlowTotal] = useState(0);
  const [flowPage, setFlowPage] = useState(1);
  const [flowsLoading, setFlowsLoading] = useState(false);

  const [appBreakdown, setAppBreakdown] = useState([]);
  const [topTalkers, setTopTalkers] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [protocolBreakdown, setProtocolBreakdown] = useState([]);

  // Load session
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await getSession(id);
        setSession(res.data);
      } catch (err) { console.error(err); }
    };
    fetchSession();
    const interval = setInterval(async () => {
      const res = await getSession(id);
      setSession(res.data);
      if (res.data.status !== 'processing') clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);

  // Load packets
  const loadPackets = useCallback(async () => {
    setPacketsLoading(true);
    try {
      const params = { sessionId: id, page: packetPage, limit: 50 };
      if (packetFilter.appType) params.appType = packetFilter.appType;
      if (packetFilter.blocked) params.blocked = packetFilter.blocked;
      const res = await getPackets(params);
      setPackets(res.data.packets);
      setPacketTotal(res.data.total);
      setPacketPages(res.data.pages);
    } catch (err) { console.error(err); }
    finally { setPacketsLoading(false); }
  }, [id, packetPage, packetFilter]);

  // Load flows
  const loadFlows = useCallback(async () => {
    setFlowsLoading(true);
    try {
      const res = await getFlows({ sessionId: id, page: flowPage, limit: 50 });
      setFlows(res.data.flows);
      setFlowTotal(res.data.total);
    } catch (err) { console.error(err); }
    finally { setFlowsLoading(false); }
  }, [id, flowPage]);

  // Load analytics
  useEffect(() => {
    if (!session || session.status !== 'completed') return;
    getPacketAppBreakdown(id).then((r) => setAppBreakdown(r.data)).catch(console.error);
    getTopTalkers(id).then((r) => setTopTalkers(r.data)).catch(console.error);
    getTimeline(id).then((r) => setTimeline(r.data)).catch(console.error);
    getProtocolBreakdown(id).then((r) => setProtocolBreakdown(r.data)).catch(console.error);
  }, [id, session?.status]);

  useEffect(() => { if (activeTab === 'Packets') loadPackets(); }, [activeTab, packetPage, packetFilter]);
  useEffect(() => { if (activeTab === 'Flows') loadFlows(); }, [activeTab, flowPage]);

  if (!session) {
    return (
      <div style={{ padding: 40, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="loader" />
        <span className="text-muted mono">Loading session...</span>
      </div>
    );
  }

  const totalPct = session.totalPackets
    ? `${((session.droppedPackets / session.totalPackets) * 100).toFixed(1)}% dropped`
    : '';

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <Link to="/sessions" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>← Sessions</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className={`status-dot ${session.status}`} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'Space Mono', textTransform: 'uppercase' }}>
            {session.status}
          </span>
        </div>
        <div className="page-title">// {session.name}</div>
        <div className="page-subtitle">
          {session.filename} · {formatBytes(session.fileSize)}
          {session.processingTime ? ` · analyzed in ${session.processingTime}ms` : ''}
        </div>
      </div>

      {session.status === 'processing' && (
        <div style={{ padding: '12px 32px', background: 'rgba(255,170,0,0.08)', borderBottom: '1px solid rgba(255,170,0,0.2)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="loader" style={{ borderTopColor: 'var(--warn)' }} />
          <span style={{ color: 'var(--warn)', fontFamily: 'Space Mono', fontSize: '0.75rem' }}>
            PROCESSING... DPI analysis in progress
          </span>
        </div>
      )}

      {session.status === 'failed' && (
        <div style={{ padding: '12px 32px', background: 'var(--danger-glow)', borderBottom: '1px solid var(--danger-dim)', color: 'var(--danger)', fontFamily: 'Space Mono', fontSize: '0.75rem' }}>
          ✕ ANALYSIS FAILED: {session.error}
        </div>
      )}

      <div className="page-body">
        {/* Stats Row */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-box">
            <div className="stat-value">{session.totalPackets?.toLocaleString() || '—'}</div>
            <div className="stat-label">Total Packets</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{formatBytes(session.totalBytes)}</div>
            <div className="stat-label">Total Bytes</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{session.forwardedPackets?.toLocaleString() || '—'}</div>
            <div className="stat-label">Forwarded</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{session.droppedPackets?.toLocaleString() || '—'}</div>
            <div className="stat-label">Dropped {totalPct ? `(${totalPct})` : ''}</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{session.uniqueFlows?.toLocaleString() || '—'}</div>
            <div className="stat-label">Unique Flows</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{session.detectedDomains?.length || '0'}</div>
            <div className="stat-label">SNIs / Domains</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{session.tcpPackets?.toLocaleString() || '—'}</div>
            <div className="stat-label">TCP Packets</div>
          </div>
          <div className="stat-box">
            <div className="stat-value" style={{ color: 'var(--warn)' }}>{session.udpPackets?.toLocaleString() || '—'}</div>
            <div className="stat-label">UDP Packets</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                fontFamily: 'Space Mono',
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ─── Packets Tab ─── */}
        {activeTab === 'Packets' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>
                // Packets — {packetTotal.toLocaleString()} total
              </div>
              <div className="filter-bar" style={{ padding: 0 }}>
                <select
                  className="select"
                  value={packetFilter.appType}
                  onChange={(e) => { setPacketFilter((f) => ({ ...f, appType: e.target.value })); setPacketPage(1); }}
                >
                  <option value="">All Apps</option>
                  {['HTTPS', 'HTTP', 'DNS', 'YOUTUBE', 'FACEBOOK', 'GOOGLE', 'NETFLIX', 'TIKTOK', 'GITHUB', 'UNKNOWN'].map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                <select
                  className="select"
                  value={packetFilter.blocked}
                  onChange={(e) => { setPacketFilter((f) => ({ ...f, blocked: e.target.value })); setPacketPage(1); }}
                >
                  <option value="">All Packets</option>
                  <option value="false">Forwarded Only</option>
                  <option value="true">Blocked Only</option>
                </select>
              </div>
            </div>

            {packetsLoading ? (
              <div style={{ display: 'flex', gap: 12, padding: 20 }}>
                <div className="loader" /> <span className="text-muted mono">Loading packets...</span>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Time</th>
                        <th>Src IP:Port</th>
                        <th>Dst IP:Port</th>
                        <th>Proto</th>
                        <th>App</th>
                        <th>SNI / Host</th>
                        <th>Flags</th>
                        <th>Len</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packets.map((p) => (
                        <tr key={p._id} className={p.blocked ? 'blocked-row' : ''}>
                          <td style={{ color: 'var(--text-muted)' }}>{p.index}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                            {p.timestamp ? new Date(p.timestamp * 1000).toLocaleTimeString() : '—'}
                          </td>
                          <td>{p.srcIp || '—'}{p.srcPort ? `:${p.srcPort}` : ''}</td>
                          <td>{p.dstIp || '—'}{p.dstPort ? `:${p.dstPort}` : ''}</td>
                          <td><span className="badge badge-muted">{p.protocolName || '—'}</span></td>
                          <td><AppBadge type={p.appType || 'UNKNOWN'} /></td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.sni || p.httpHost || <span className="text-muted">—</span>}
                          </td>
                          <td style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{p.tcpFlags || '—'}</td>
                          <td>{p.capturedLength || '—'}</td>
                          <td>
                            {p.blocked
                              ? <span className="badge badge-danger">BLOCKED</span>
                              : <span className="badge badge-success">FWD</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button className="btn btn-ghost btn-sm" disabled={packetPage === 1} onClick={() => setPacketPage((p) => p - 1)}>←</button>
                  <span className="page-info">Page {packetPage} of {packetPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={packetPage >= packetPages} onClick={() => setPacketPage((p) => p + 1)}>→</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Flows Tab ─── */}
        {activeTab === 'Flows' && (
          <div className="card">
            <div className="card-title">// Network Flows — {flowTotal.toLocaleString()} total</div>
            {flowsLoading ? (
              <div style={{ display: 'flex', gap: 12, padding: 20 }}><div className="loader" /> <span className="text-muted mono">Loading flows...</span></div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Src IP</th>
                        <th>Dst IP</th>
                        <th>Src Port</th>
                        <th>Dst Port</th>
                        <th>Proto</th>
                        <th>App</th>
                        <th>SNI</th>
                        <th>Packets</th>
                        <th>Bytes</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flows.map((f) => (
                        <tr key={f._id} className={f.blocked ? 'blocked-row' : ''}>
                          <td>{f.srcIp}</td>
                          <td>{f.dstIp}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{f.srcPort}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{f.dstPort}</td>
                          <td><span className="badge badge-muted">{f.protocolName}</span></td>
                          <td><AppBadge type={f.appType} /></td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.sni || f.httpHost || <span className="text-muted">—</span>}
                          </td>
                          <td>{f.packetCount}</td>
                          <td>{formatBytes(f.byteCount)}</td>
                          <td>
                            {f.blocked
                              ? <span className="badge badge-danger" title={f.blockReason}>BLOCKED</span>
                              : <span className="badge badge-success">FWD</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button className="btn btn-ghost btn-sm" disabled={flowPage === 1} onClick={() => setFlowPage((p) => p - 1)}>←</button>
                  <span className="page-info">Page {flowPage}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFlowPage((p) => p + 1)}>→</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── App Traffic Tab ─── */}
        {activeTab === 'App Traffic' && (
          <div className="grid-2">
            <div className="card">
              <div className="card-title">// Application Breakdown — Packet Count</div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={appBreakdown.map((d) => ({ name: d._id || 'UNKNOWN', value: d.count }))}
                    cx="50%" cy="50%"
                    innerRadius={70} outerRadius={110}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {appBreakdown.map((d, i) => (
                      <Cell key={i} fill={APP_COLORS[d._id] || '#3a5a7a'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'Space Mono', fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-title">// App Traffic Table</div>
              <table className="data-table">
                <thead>
                  <tr><th>Application</th><th>Packets</th><th>Blocked</th><th>%</th></tr>
                </thead>
                <tbody>
                  {appBreakdown.map((d) => {
                    const pct = session.totalPackets ? ((d.count / session.totalPackets) * 100).toFixed(1) : 0;
                    return (
                      <tr key={d._id}>
                        <td><AppBadge type={d._id || 'UNKNOWN'} /></td>
                        <td>{d.count.toLocaleString()}</td>
                        <td style={{ color: d.blocked > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{d.blocked}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: APP_COLORS[d._id] || 'var(--accent)', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── SNI / Domains Tab ─── */}
        {activeTab === 'SNI / Domains' && (
          <div className="card">
            <div className="card-title">// Detected SNI / Host Domains ({session.detectedDomains?.length || 0})</div>
            {session.detectedDomains?.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">◈</div><div className="empty-title">No domains detected</div></div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {session.detectedDomains?.map((d) => (
                  <span key={d} style={{
                    padding: '4px 10px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 3,
                    fontFamily: 'Space Mono',
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                  }}>
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Top Talkers Tab ─── */}
        {activeTab === 'Top Talkers' && (
          <div className="card">
            <div className="card-title">// Top Source IPs by Bandwidth</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topTalkers.map((t) => ({ name: t._id, bytes: t.byteCount, packets: t.packetCount }))} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Space Mono' }} axisLine={{ stroke: 'var(--border)' }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'Space Mono' }} axisLine={{ stroke: 'var(--border)' }} width={130} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'Space Mono', fontSize: 11 }} />
                <Bar dataKey="bytes" fill="var(--accent)" opacity={0.8} radius={[0, 2, 2, 0]} name="Bytes" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ─── Timeline Tab ─── */}
        {activeTab === 'Timeline' && (
          <div className="card">
            <div className="card-title">// Traffic Timeline — Packets per Second</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeline.map((t) => ({ time: t._id, packets: t.count, dropped: t.dropped }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} axisLine={{ stroke: 'var(--border)' }} tickFormatter={(v) => v ? new Date(v * 1000).toLocaleTimeString() : ''} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'Space Mono' }} axisLine={{ stroke: 'var(--border)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'Space Mono', fontSize: 11 }} />
                <Line type="monotone" dataKey="packets" stroke="var(--accent)" strokeWidth={2} dot={false} name="Packets" />
                <Line type="monotone" dataKey="dropped" stroke="var(--danger)" strokeWidth={2} dot={false} name="Dropped" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
