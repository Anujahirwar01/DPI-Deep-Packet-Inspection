import axios from 'axios';

// Falls back to Render backend if env var not set at build time
const API_BASE = process.env.REACT_APP_API_URL || 'https://dpi-deep-packet-inspection.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes — large PCAPs take time
});

// Sessions
export const getSessions = () => api.get('/sessions');
export const getSession = (id) => api.get(`/sessions/${id}`);
export const uploadPcap = (formData, onProgress) =>
  api.post('/sessions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    onUploadProgress: onProgress,
  });
export const deleteSession = (id) => api.delete(`/sessions/${id}`);

// Packets
export const getPackets = (params) => api.get('/packets', { params });
export const getPacketAppBreakdown = (sessionId) =>
  api.get('/packets/breakdown/apps', { params: { sessionId } });

// Flows
export const getFlows = (params) => api.get('/flows', { params });
export const getTopTalkers = (sessionId) =>
  api.get('/flows/top-talkers', { params: { sessionId } });

// Rules
export const getRules = () => api.get('/rules');
export const createRule = (data) => api.post('/rules', data);
export const updateRule = (id, data) => api.put(`/rules/${id}`, data);
export const toggleRule = (id) => api.patch(`/rules/${id}/toggle`);
export const deleteRule = (id) => api.delete(`/rules/${id}`);
export const seedRules = () => api.post('/rules/seed');

// Stats
export const getOverviewStats = () => api.get('/stats/overview');
export const getTimeline = (sessionId) => api.get('/stats/timeline', { params: { sessionId } });
export const getProtocolBreakdown = (sessionId) =>
  api.get('/stats/protocols', { params: { sessionId } });

export default api;
