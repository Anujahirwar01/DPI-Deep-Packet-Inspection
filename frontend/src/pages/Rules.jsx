import React, { useEffect, useState } from 'react';
import { getRules, createRule, deleteRule, toggleRule, seedRules } from '../utils/api';

const RULE_TYPE_INFO = {
  ip: { label: 'IP Address', placeholder: '192.168.1.100', color: 'var(--danger)', desc: 'Block all traffic from this source IP' },
  app: { label: 'Application', placeholder: 'YOUTUBE', color: 'var(--accent)', desc: 'Block all traffic for this app type' },
  domain: { label: 'Domain', placeholder: 'tiktok.com', color: 'var(--warn)', desc: 'Block traffic to matching SNI/Host' },
  port: { label: 'Port', placeholder: '443', color: '#aa88ff', desc: 'Block traffic to this destination port' },
};

const APP_OPTIONS = ['YOUTUBE', 'FACEBOOK', 'NETFLIX', 'TIKTOK', 'GOOGLE', 'GITHUB', 'AMAZON', 'MICROSOFT', 'APPLE', 'CLOUDFLARE'];

function RuleTypeBadge({ type }) {
  const info = RULE_TYPE_INFO[type];
  return (
    <span className="badge" style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}44` }}>
      {type.toUpperCase()}
    </span>
  );
}

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'ip', value: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await getRules();
      setRules(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.value) return;
    setSaving(true);
    try {
      await createRule(form);
      setForm({ name: '', type: 'ip', value: '', description: '' });
      setShowForm(false);
      fetchRules();
    } catch (err) {
      alert('Failed to create rule: ' + (err.response?.data?.error || err.message));
    } finally { setSaving(false); }
  };

  const handleToggle = async (id) => {
    try {
      const res = await toggleRule(id);
      setRules((prev) => prev.map((r) => r._id === id ? res.data : r));
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r._id !== id));
    } catch (err) { console.error(err); }
  };

  const handleSeed = async () => {
    if (!window.confirm('This will add 4 sample blocking rules. Continue?')) return;
    try {
      await seedRules();
      fetchRules();
    } catch (err) { console.error(err); }
  };

  const typeInfo = RULE_TYPE_INFO[form.type];
  const activeRules = rules.filter((r) => r.active);
  const inactiveRules = rules.filter((r) => !r.active);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">// BLOCKING RULES</div>
        <div className="page-subtitle">Define IP, application, domain, and port blocking policies</div>
      </div>

      <div className="page-body">
        {/* Header actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ New Rule'}
          </button>
          <button className="btn btn-ghost" onClick={handleSeed}>
            ◈ Load Sample Rules
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Mono', fontSize: '1.2rem', color: 'var(--danger)', fontWeight: 700 }}>{activeRules.length}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Mono', fontSize: '1.2rem', color: 'var(--text-muted)', fontWeight: 700 }}>{inactiveRules.length}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Inactive</div>
            </div>
          </div>
        </div>

        {/* Create Rule Form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 24, borderColor: 'var(--accent-dim)' }}>
            <div className="card-title">// Create New Rule</div>
            <form onSubmit={handleCreate}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Space Mono', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                    RULE NAME *
                  </label>
                  <input
                    className="input"
                    placeholder="e.g. Block YouTube"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Space Mono', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                    RULE TYPE *
                  </label>
                  <select
                    className="select"
                    style={{ width: '100%' }}
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, value: '' }))}
                  >
                    {Object.entries(RULE_TYPE_INFO).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 4, border: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ℹ {typeInfo.desc}
              </div>

              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Space Mono', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                    VALUE *
                  </label>
                  {form.type === 'app' ? (
                    <select
                      className="select"
                      style={{ width: '100%' }}
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      required
                    >
                      <option value="">Select app...</option>
                      {APP_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input"
                      placeholder={typeInfo.placeholder}
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      required
                    />
                  )}
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Space Mono', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                    DESCRIPTION
                  </label>
                  <input
                    className="input"
                    placeholder="Optional description..."
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <><span className="loader" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Saving...</> : '+ Create Rule'}
              </button>
            </form>
          </div>
        )}

        {/* Rules Table */}
        <div className="card">
          <div className="card-title">// All Rules ({rules.length})</div>

          {loading ? (
            <div style={{ display: 'flex', gap: 12, padding: 20 }}><div className="loader" /> <span className="text-muted mono">Loading rules...</span></div>
          ) : rules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">◉</div>
              <div className="empty-title">No blocking rules defined</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Create rules above or load sample rules to get started
              </div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Description</th>
                  <th>Hit Count</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule._id} style={{ opacity: rule.active ? 1 : 0.5 }}>
                    <td>
                      <button
                        onClick={() => handleToggle(rule._id)}
                        title={rule.active ? 'Click to disable' : 'Click to enable'}
                        style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          background: rule.active ? 'var(--danger)' : 'var(--border)',
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: 3,
                          left: rule.active ? 18 : 3,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: 'white',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{rule.name}</td>
                    <td><RuleTypeBadge type={rule.type} /></td>
                    <td style={{ fontFamily: 'Space Mono', color: rule.active ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {rule.value}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{rule.description || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {rule.hitCount > 0
                        ? <span className="badge badge-danger">{rule.hitCount}</span>
                        : <span className="text-muted">0</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{new Date(rule.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rule._id)}>✕ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Rule Explanation */}
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">// How Rules Work</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {Object.entries(RULE_TYPE_INFO).map(([type, info]) => (
              <div key={type} style={{ padding: 14, background: 'var(--bg-base)', borderRadius: 4, border: `1px solid ${info.color}22` }}>
                <div style={{ color: info.color, fontFamily: 'Space Mono', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6 }}>
                  {type.toUpperCase()} RULE
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{info.desc}</div>
                <div style={{ marginTop: 8, fontFamily: 'Space Mono', fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-panel)', padding: '4px 8px', borderRadius: 3 }}>
                  e.g. {info.placeholder}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
