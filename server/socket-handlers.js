const { state, getCurrentPosition } = require('./state');
const { getVideos } = require('./routes/videos');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Send full state immediately on join (drift-compensated position)
    socket.emit('state', {
      currentVideo: state.currentVideo,
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

    socket.on('queue:add', ({ videoId }) => {
      const videos = getVideos();
      const video = videos.find((v) => v.id === videoId);
      if (!video) return;

      if (!state.currentVideo) {
        // Nothing playing — auto-load this video
        state.currentVideo = video;
        state.position = 0;
        state.positionUpdatedAt = Date.now();
        state.isPlaying = false;
        io.emit('video:changed', { video, position: 0 });
      } else {
        state.queue.push(video);
        io.emit('queue:updated', { queue: state.queue });
      }
    });

    socket.on('queue:remove', ({ index }) => {
      if (index < 0 || index >= state.queue.length) return;
      state.queue.splice(index, 1);
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

    socket.on('queue:next', () => {
      if (state.queue.length === 0) {
        state.currentVideo = null;
        state.position = 0;
        state.isPlaying = false;
        io.emit('video:changed', { video: null, position: 0 });
        return;
      }
      const next = state.queue.shift();
      state.currentVideo = next;
      state.position = 0;
      state.positionUpdatedAt = Date.now();
      state.isPlaying = false;
      io.emit('video:changed', { video: next, position: 0 });
      io.emit('queue:updated', { queue: state.queue });
    });

    // ── Re-sync on demand ──────────────────────────────────────────────────

    socket.on('request-state', () => {
      socket.emit('state', {
        currentVideo: state.currentVideo,
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
