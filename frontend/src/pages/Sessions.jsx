import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, uploadPcap, deleteSession } from '../utils/api';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

export default function Sessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const fetchSessions = async () => {
    try {
      const res = await getSessions();
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    pollRef.current = setInterval(() => {
      setSessions((prev) => {
        if (prev.some((s) => s.status === 'processing')) fetchSessions();
        return prev;
      });
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('pcap', file);
    formData.append('name', sessionName || file.name);

    try {
      await uploadPcap(formData, (e) => {
        if (e.total) setUploadProgress(Math.round((e.loaded * 100) / e.total));
      });
      setSessionName('');
      fetchSessions();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      if (msg.includes('Network Error') || msg.includes('502') || msg.includes('ECONNRESET')) {
        alert('Cannot reach backend server. Make sure: 1. Backend is running (cd backend && npm run dev) 2. MongoDB is running 3. Check backend terminal for errors');
      } else {
        alert('Upload failed: ' + msg);
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this session and all its data?')) return;
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">// SESSIONS</div>
        <div className="page-subtitle">Upload PCAP captures for deep packet inspection analysis</div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">// Upload PCAP File</div>

          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="Session name (optional)"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>

          <div
            className={`upload-zone${dragOver ? ' drag-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pcap,.pcapng"
              onChange={(e) => handleUpload(e.target.files[0])}
            />
            {uploading ? (
              <div>
                <div className="loader" style={{ margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--accent)', fontFamily: 'Space Mono', fontSize: '0.8rem' }}>
                  Uploading... {uploadProgress}%
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.4 }}>◈</div>
                <div style={{ color: 'var(--text-secondary)', fontFamily: 'Space Mono', fontSize: '0.8rem' }}>
                  DROP .PCAP FILE HERE
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 8 }}>
                  or click to browse · max 100MB
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">// Analysis Sessions ({sessions.length})</div>

          {loading ? (
            <div style={{ display: 'flex', gap: 12, padding: '20px 0' }}>
              <div className="loader" /> <span className="text-muted mono">Loading sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◈</div>
              <div className="empty-title">No sessions yet</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Upload a .pcap file above to begin</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Packets</th>
                  <th>TCP / UDP</th>
                  <th>Forwarded</th>
                  <th>Dropped</th>
                  <th>Flows</th>
                  <th>File Size</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s._id}>
                    <td>
                      {s.status === 'completed' ? (
                        <Link to={`/sessions/${s._id}`} style={{ color: 'var(--accent)' }}>
                          {s.name}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`status-dot ${s.status}`} />
                        <span style={{
                          color: s.status === 'completed' ? 'var(--success)'
                            : s.status === 'failed' ? 'var(--danger)'
                              : s.status === 'processing' ? 'var(--warn)'
                                : 'var(--text-muted)',
                          fontSize: '0.7rem',
                          fontFamily: 'Space Mono',
                          textTransform: 'uppercase',
                        }}>
                          {s.status}
                        </span>
                      </span>
                    </td>
                    <td>{s.totalPackets?.toLocaleString() || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {s.tcpPackets != null ? `${s.tcpPackets} / ${s.udpPackets}` : '—'}
                    </td>
                    <td style={{ color: 'var(--success)' }}>
                      {s.forwardedPackets?.toLocaleString() || '—'}
                    </td>
                    <td style={{ color: s.droppedPackets > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {s.droppedPackets != null ? s.droppedPackets.toLocaleString() : '—'}
                    </td>
                    <td>{s.uniqueFlows?.toLocaleString() || '—'}</td>
                    <td>{formatBytes(s.fileSize)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(s._id)}
                      >
                        ✕
                      </button>
                    </td>
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