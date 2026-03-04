const { state, getCurrentPosition } = require('./state');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Send full state immediately on join (drift-compensated position)
    socket.emit('state', {
      currentFilename: state.currentFilename,
      position: getCurrentPosition(),
      isPlaying: state.isPlaying,
      queue: state.queue,
    });

    // ── Playback controls ──────────────────────────────────────────────────

    socket.on('play', ({ position }) => {
      state.position = position;
      state.positionUpdatedAt = Date.now();
      state.isPlaying = true;
      io.emit('play', { position });
    });

    socket.on('pause', ({ position }) => {
      state.position = position;
      state.positionUpdatedAt = Date.now();
      state.isPlaying = false;
      io.emit('pause', { position });
    });

    socket.on('seek', ({ position }) => {
      state.position = position;
      state.positionUpdatedAt = Date.now();
      io.emit('seek', { position });
    });

    // ── Position heartbeat (no broadcast, just server sync) ────────────────

    socket.on('position:report', ({ position }) => {
      state.position = position;
      state.positionUpdatedAt = Date.now();
    });

    // ── Queue management ───────────────────────────────────────────────────

    socket.on('queue:add', ({ filename }) => {
      if (!filename) return;

      if (!state.currentFilename) {
        // Nothing loaded — auto-load this file for everyone
        state.currentFilename = filename;
        state.position = 0;
        state.positionUpdatedAt = Date.now();
        state.isPlaying = false;
        io.emit('video:changed', { filename, position: 0 });
      } else {
        state.queue.push(filename);
        io.emit('queue:updated', { queue: state.queue });
      }
    });

    // Remove by filename (stable ID), not by index
    socket.on('queue:remove', ({ filename }) => {
      const idx = state.queue.indexOf(filename);
      if (idx === -1) return;
      state.queue.splice(idx, 1);
      io.emit('queue:updated', { queue: state.queue });
    });

    socket.on('queue:reorder', ({ fromIndex, toIndex }) => {
      const q = state.queue;
      if (
        fromIndex < 0 || fromIndex >= q.length ||
        toIndex < 0 || toIndex >= q.length
      ) return;
      const [item] = q.splice(fromIndex, 1);
      q.splice(toIndex, 0, item);
      io.emit('queue:updated', { queue: state.queue });
    });

    // Guard against every client firing this simultaneously when a video ends
    socket.on('queue:next', () => {
      if (state.advancingQueue) return;
      state.advancingQueue = true;
      setTimeout(() => { state.advancingQueue = false; }, 1000);

      if (state.queue.length === 0) {
        state.currentFilename = null;
        state.position = 0;
        state.isPlaying = false;
        io.emit('video:changed', { filename: null, position: 0 });
        return;
      }

      const next = state.queue.shift();
      state.currentFilename = next;
      state.position = 0;
      state.positionUpdatedAt = Date.now();
      state.isPlaying = false;
      io.emit('video:changed', { filename: next, position: 0 });
      io.emit('queue:updated', { queue: state.queue });
    });

    // ── Re-sync on demand ──────────────────────────────────────────────────

    socket.on('request-state', () => {
      socket.emit('state', {
        currentFilename: state.currentFilename,
        position: getCurrentPosition(),
        isPlaying: state.isPlaying,
        queue: state.queue,
      });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}

module.exports = { registerSocketHandlers };
