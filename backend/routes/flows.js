const express = require('express');
const router = express.Router();
const Flow = require('../models/Flow');
const mongoose = require('mongoose');

// GET flows for a session
router.get('/', async (req, res) => {
  try {
    const { sessionId, page = 1, limit = 50, appType, blocked } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const filter = { sessionId };
    if (appType) filter.appType = appType;
    if (blocked !== undefined) filter.blocked = blocked === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [flows, total] = await Promise.all([
      Flow.find(filter).sort({ packetCount: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Flow.countDocuments(filter),
    ]);

    res.json({
      flows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET top talkers (source IPs by packet count)
router.get('/top-talkers', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const talkers = await Flow.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
      {
        $group: {
          _id: '$srcIp',
          packetCount: { $sum: '$packetCount' },
          byteCount: { $sum: '$byteCount' },
          flowCount: { $sum: 1 },
        },
      },
      { $sort: { byteCount: -1 } },
      { $limit: 10 },
    ]);

    res.json(talkers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
