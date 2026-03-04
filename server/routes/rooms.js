const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.post('/', (_req, res) => {
  const roomId = crypto.randomBytes(4).toString('hex'); // e.g. "a3f9b2c1"
  res.json({ roomId });
});

module.exports = router;
