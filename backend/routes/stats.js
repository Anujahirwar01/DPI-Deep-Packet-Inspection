const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Packet = require('../models/Packet');
const Flow = require('../models/Flow');
const mongoose = require('mongoose');

// GET overall platform stats
router.get('/overview', async (req, res) => {
  try {
    const [totalSessions, completedSessions] = await Promise.all([
      Session.countDocuments(),
      Session.countDocuments({ status: 'completed' }),
    ]);

    const agg = await Session.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalPackets: { $sum: '$totalPackets' },
          totalBytes: { $sum: '$totalBytes' },
          totalDropped: { $sum: '$droppedPackets' },
          totalForwarded: { $sum: '$forwardedPackets' },
        },
      },
    ]);

    res.json({
      totalSessions,
      completedSessions,
      ...(agg[0] || { totalPackets: 0, totalBytes: 0, totalDropped: 0, totalForwarded: 0 }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET traffic timeline for a session (packets grouped by second)
router.get('/timeline', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const timeline = await Packet.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
      {
        $group: {
          _id: '$timestamp',
          count: { $sum: 1 },
          bytes: { $sum: '$capturedLength' },
          dropped: { $sum: { $cond: ['$blocked', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 300 },
    ]);

    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET protocol breakdown
router.get('/protocols', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const breakdown = await Packet.aggregate([
      { $match: { sessionId: new mongoose.Types.ObjectId(sessionId) } },
      {
        $group: {
          _id: '$protocolName',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(breakdown);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
