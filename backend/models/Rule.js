const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ['ip', 'app', 'domain', 'port'],
    required: true,
  },
  value: { type: String, required: true },
  description: { type: String },
  active: { type: Boolean, default: true },
  hitCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

RuleSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Rule', RuleSchema);
