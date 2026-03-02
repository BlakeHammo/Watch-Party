require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRouter = require('./routes/auth');
const videosRouter = require('./routes/videos');
const { verifyToken } = require('./middleware/auth');
const { registerSocketHandlers } = require('./socket-handlers');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/videos', videosRouter);

// Health check
app.get('/api/health', verifyToken, (_req, res) => res.json({ ok: true }));

// ── Socket.io ────────────────────────────────────────────────────────────────
// Authenticate socket connections via handshake auth token
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const jwt = require('jsonwebtoken');
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

registerSocketHandlers(io);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
