const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  filename: { type: String, required: true },
  fileSize: { type: Number },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  totalPackets: { type: Number, default: 0 },
  totalBytes: { type: Number, default: 0 },
  tcpPackets: { type: Number, default: 0 },
  udpPackets: { type: Number, default: 0 },
  forwardedPackets: { type: Number, default: 0 },
  droppedPackets: { type: Number, default: 0 },
  uniqueFlows: { type: Number, default: 0 },
  detectedDomains: [{ type: String }],
  processingTime: { type: Number }, // ms
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SessionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Session', SessionSchema);
