const mongoose = require('mongoose');

const PacketSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  index: { type: Number, required: true },

  // Timestamps
  timestamp: { type: Number }, // epoch seconds
  timestampUs: { type: Number }, // microseconds

  // Ethernet
  srcMac: { type: String },
  dstMac: { type: String },
  etherType: { type: String },

  // Network (Layer 3)
  srcIp: { type: String },
  dstIp: { type: String },
  protocol: { type: Number }, // 6=TCP, 17=UDP, 1=ICMP
  protocolName: { type: String },
  ttl: { type: Number },
  ipLength: { type: Number },

  // Transport (Layer 4)
  srcPort: { type: Number },
  dstPort: { type: Number },
  tcpFlags: { type: String },
  sequenceNumber: { type: Number },
  ackNumber: { type: Number },
  payloadLength: { type: Number },

  // DPI results
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
  httpMethod: { type: String },
  httpPath: { type: String },
  isTlsClientHello: { type: Boolean, default: false },

  // Flow reference
  flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flow' },

  // Blocking decision
  blocked: { type: Boolean, default: false },
  blockReason: { type: String },

  // Raw size
  capturedLength: { type: Number },
  originalLength: { type: Number },
});

PacketSchema.index({ sessionId: 1, index: 1 });
PacketSchema.index({ sessionId: 1, srcIp: 1 });
PacketSchema.index({ sessionId: 1, appType: 1 });
PacketSchema.index({ sessionId: 1, blocked: 1 });

module.exports = mongoose.model('Packet', PacketSchema);
