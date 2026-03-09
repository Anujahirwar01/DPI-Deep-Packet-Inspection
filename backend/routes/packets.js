const express = require('express');
const router = express.Router();
const Packet = require('../models/Packet');

// GET packets for a session (paginated)
router.get('/', async (req, res) => {
  try {
    const { sessionId, page = 1, limit = 50, appType, blocked, srcIp, protocol } = req.query;

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const filter = { sessionId };
    if (appType) filter.appType = appType;
    if (blocked !== undefined) filter.blocked = blocked === 'true';
    if (srcIp) filter.srcIp = srcIp;
    if (protocol) filter.protocolName = protocol;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [packets, total] = await Promise.all([
      Packet.find(filter)
        .sort({ index: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Packet.countDocuments(filter),
    ]);

    res.json({
      packets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET app type breakdown for session
router.get('/breakdown/apps', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const mongoose = require('mongoose');
    const breakdown = await Packet.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
      {
        $group: {
          _id: '$appType',
          count: { $sum: 1 },
          blocked: { $sum: { $cond: ['$blocked', 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single packet
router.get('/:id', async (req, res) => {
  try {
    const packet = await Packet.findById(req.params.id).populate('flowId').lean();
    if (!packet) return res.status(404).json({ error: 'Packet not found' });
    res.json(packet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
