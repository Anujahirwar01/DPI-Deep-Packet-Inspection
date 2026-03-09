const mongoose = require('mongoose');

const FlowSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },

  // Five-tuple
  srcIp: { type: String, required: true },
  dstIp: { type: String, required: true },
  srcPort: { type: Number, required: true },
  dstPort: { type: Number, required: true },
  protocol: { type: Number, required: true },
  protocolName: { type: String },

  // DPI classification
  appType: {
    type: String,
    enum: [
      'UNKNOWN', 'HTTP', 'HTTPS', 'DNS', 'GOOGLE', 'YOUTUBE',
      'FACEBOOK', 'TWITTER', 'NETFLIX', 'TIKTOK', 'GITHUB',
      'AMAZON', 'MICROSOFT', 'APPLE', 'CLOUDFLARE', 'OTHER',
    ],
    default: 'UNKNOWN',
  },
  sni: { type: String },
  httpHost: { type: String },

  // Statistics
  packetCount: { type: Number, default: 0 },
  byteCount: { type: Number, default: 0 },

  // Blocking
  blocked: { type: Boolean, default: false },
  blockReason: { type: String },

  // Timing
  firstSeen: { type: Number },
  lastSeen: { type: Number },
});

FlowSchema.index({ sessionId: 1, srcIp: 1, dstIp: 1 });
FlowSchema.index({ sessionId: 1, appType: 1 });
FlowSchema.index({ sessionId: 1, blocked: 1 });

module.exports = mongoose.model('Flow', FlowSchema);
