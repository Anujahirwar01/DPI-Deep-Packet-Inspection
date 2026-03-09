const express = require('express');
const router = express.Router();
const Rule = require('../models/Rule');

// GET all rules
router.get('/', async (req, res) => {
  try {
    const rules = await Rule.find().sort({ createdAt: -1 }).lean();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create rule
router.post('/', async (req, res) => {
  try {
    const { name, type, value, description } = req.body;
    if (!name || !type || !value) {
      return res.status(400).json({ error: 'name, type, and value are required' });
    }
    const rule = new Rule({ name, type, value, description });
    await rule.save();
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update rule
router.put('/:id', async (req, res) => {
  try {
    const rule = await Rule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH toggle active
router.patch('/:id/toggle', async (req, res) => {
  try {
    const rule = await Rule.findById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    rule.active = !rule.active;
    await rule.save();
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE rule
router.delete('/:id', async (req, res) => {
  try {
    const rule = await Rule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST seed default rules
router.post('/seed', async (req, res) => {
  try {
    const defaults = [
      { name: 'Block YouTube', type: 'app', value: 'YOUTUBE', description: 'Block all YouTube traffic' },
      { name: 'Block TikTok', type: 'app', value: 'TIKTOK', description: 'Block all TikTok traffic' },
      { name: 'Block Facebook', type: 'app', value: 'FACEBOOK', description: 'Block all Facebook/Instagram traffic' },
      { name: 'Block Twitter', type: 'app', value: 'TWITTER', description: 'Block all Twitter traffic' },
      { name: 'Block example.com', type: 'domain', value: 'example.com', description: 'Block example domain' },
      { name: 'Block 10.0.0.66', type: 'ip', value: '10.0.0.66', description: 'Block suspicious host 10.0.0.66' },
      { name: 'Block 10.0.0.99', type: 'ip', value: '10.0.0.99', description: 'Block suspicious host 10.0.0.99' },
      { name: 'Block BitTorrent', type: 'port', value: '6881', description: 'Block BitTorrent traffic on port 6881' },
    ];
    await Rule.insertMany(defaults);
    res.json({ message: `${defaults.length} default rules created` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
