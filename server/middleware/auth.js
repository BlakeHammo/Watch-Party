const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  // Accept token from Authorization header OR ?token= query param
  // (query param needed for <video src> and <a download> which can't set headers)
  const authHeader = req.headers['authorization'];
  const token =
    (authHeader && authHeader.split(' ')[1]) || req.query.token;

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyToken };
