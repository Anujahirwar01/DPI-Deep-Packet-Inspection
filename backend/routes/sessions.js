const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Session = require('../models/Session');
const Packet = require('../models/Packet');
const Flow = require('../models/Flow');
const Rule = require('../models/Rule');
const { processPcapBuffer } = require('../utils/dpiEngine');

// Configure multer for PCAP uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  },
});

// Accept all files - browsers send inconsistent MIME types for .pcap
// We validate magic bytes after upload instead
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

// GET all sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 }).lean();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET one session
router.get('/:id', async (req, res) => {
  try {
    const session = await Session.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload PCAP and analyze
router.post('/upload', upload.single('pcap'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Make sure the field name is "pcap".' });
  }

  // Validate PCAP magic bytes (first 4 bytes = 0xa1b2c3d4 or byte-swapped)
  try {
    const magicBuf = Buffer.alloc(4);
    const fd = fs.openSync(req.file.path, 'r');
    fs.readSync(fd, magicBuf, 0, 4, 0);
    fs.closeSync(fd);
    const magic = magicBuf.readUInt32LE(0);
    if (magic !== 0xa1b2c3d4 && magic !== 0xd4c3b2a1) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        error: 'Invalid PCAP file. Magic bytes not found. Please upload a valid .pcap file.'
      });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Could not read uploaded file: ' + e.message });
  }

  const sessionName = req.body.name || req.file.originalname;

  // Create session record immediately and respond — process async
  const session = new Session({
    name: sessionName,
    filename: req.file.filename,
    fileSize: req.file.size,
    status: 'processing',
  });
  await session.save();

  // Respond immediately so the proxy doesn't time out
  res.json({ sessionId: session._id, status: 'processing', message: 'Analysis started' });

  // Async DPI processing (runs after response is sent)
  setImmediate(async () => {
    const startTime = Date.now();
    try {
      const rules = await Rule.find({ active: true }).lean();
      const buffer = fs.readFileSync(req.file.path);
      const result = processPcapBuffer(buffer, rules);

      // Save flows
      const flowDocs = result.flows.map(f => new Flow({ sessionId: session._id, ...f }));
      if (flowDocs.length > 0) await Flow.insertMany(flowDocs);

      // Build flow key map
      const flowMap = new Map();
      for (let i = 0; i < result.flows.length; i++) {
        const f = result.flows[i];
        flowMap.set(`${f.srcIp}:${f.srcPort}-${f.dstIp}:${f.dstPort}-${f.protocol}`, flowDocs[i]._id);
      }

      // Save packets in batches of 500
      const BATCH = 500;
      for (let i = 0; i < result.packets.length; i += BATCH) {
        const batch = result.packets.slice(i, i + BATCH).map((p) => ({
          sessionId: session._id,
          flowId: p.srcIp
            ? flowMap.get(`${p.srcIp}:${p.srcPort || 0}-${p.dstIp}:${p.dstPort || 0}-${p.protocol || 0}`)
            : undefined,
          ...p,
        }));
        await Packet.insertMany(batch, { ordered: false });
      }

      // Update rule hit counts
      for (const [ruleId, hits] of result.blockedRuleHits) {
        await Rule.findByIdAndUpdate(ruleId, { $inc: { hitCount: hits } });
      }

      // Mark session complete
      await Session.findByIdAndUpdate(session._id, {
        status: 'completed',
        totalPackets: result.stats.totalPackets,
        totalBytes: result.stats.totalBytes,
        tcpPackets: result.stats.tcpPackets,
        udpPackets: result.stats.udpPackets,
        forwardedPackets: result.stats.forwardedPackets,
        droppedPackets: result.stats.droppedPackets,
        uniqueFlows: result.stats.uniqueFlows,
        detectedDomains: result.stats.detectedDomains,
        processingTime: Date.now() - startTime,
      });

      console.log(`✅ Session ${session._id} completed in ${Date.now() - startTime}ms — ${result.stats.totalPackets} packets`);

    } catch (err) {
      console.error('❌ DPI processing error:', err);
      await Session.findByIdAndUpdate(session._id, {
        status: 'failed',
        error: err.message,
      });
    }
  });
});

// DELETE session
router.delete('/:id', async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await Packet.deleteMany({ sessionId: req.params.id });
    await Flow.deleteMany({ sessionId: req.params.id });

    const filePath = path.join(__dirname, '..', 'uploads', session.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await Session.findByIdAndDelete(req.params.id);
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
