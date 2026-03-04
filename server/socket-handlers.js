const { getRoom, deleteRoom, getCurrentPosition } = require('./state');

// Broadcast current room occupancy + folder-readiness counts to everyone in the room
function emitRoomInfo(io, roomId) {
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (!roomSockets) return;
  const count = roomSockets.size;
  let folderReadyCount = 0;
  for (const id of roomSockets) {
    const s = io.sockets.sockets.get(id);
    if (s?.folderReady) folderReadyCount++;
  }
  io.to(roomId).emit('room:info', { count, folderReadyCount });
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const roomId = socket.handshake.query.roomId;

    if (!roomId || !/^[a-f0-9]{8}$/.test(roomId)) {
      console.log(`[socket] rejected — invalid roomId: ${roomId}`);
      socket.disconnect(true);
      return;
    }

    socket.folderReady = false;
    socket.join(roomId);
    console.log(`[socket] connected: ${socket.id} → room ${roomId}`);

    const s = getRoom(roomId);

    // Send full state immediately on join (drift-compensated position)
    socket.emit('state', {
      currentFilename: s.currentFilename,
      position: getCurrentPosition(roomId),
      isPlaying: s.isPlaying,
      queue: s.queue,
    });

    // Notify everyone about updated occupancy
    emitRoomInfo(io, roomId);

    // ── Folder readiness ───────────────────────────────────────────────────

    socket.on('folder:ready', () => {
      socket.folderReady = true;
      emitRoomInfo(io, roomId);
    });

    // ── Playback controls ──────────────────────────────────────────────────

    socket.on('play', ({ position }) => {
      const s = getRoom(roomId);
      s.position = position;
      s.positionUpdatedAt = Date.now();
      s.isPlaying = true;
      io.to(roomId).emit('play', { position });
    });

    socket.on('pause', ({ position }) => {
      const s = getRoom(roomId);
      s.position = position;
      s.positionUpdatedAt = Date.now();
      s.isPlaying = false;
      io.to(roomId).emit('pause', { position });
    });

    socket.on('seek', ({ position }) => {
      const s = getRoom(roomId);
      s.position = position;
      s.positionUpdatedAt = Date.now();
      io.to(roomId).emit('seek', { position });
    });

    // ── Position heartbeat (no broadcast, just server sync) ────────────────

    socket.on('position:report', ({ position }) => {
      const s = getRoom(roomId);
      s.position = position;
      s.positionUpdatedAt = Date.now();
    });

    // ── Queue management ───────────────────────────────────────────────────

    socket.on('queue:add', ({ filename }) => {
      if (!filename) return;
      const s = getRoom(roomId);

      if (!s.currentFilename) {
        // Nothing loaded — auto-load this file for everyone
        s.currentFilename = filename;
        s.position = 0;
        s.positionUpdatedAt = Date.now();
        s.isPlaying = false;
        io.to(roomId).emit('video:changed', { filename, position: 0 });
      } else {
        s.queue.push(filename);
        io.to(roomId).emit('queue:updated', { queue: s.queue });
      }
    });

    // Remove by filename (stable ID), not by index
    socket.on('queue:remove', ({ filename }) => {
      const s = getRoom(roomId);
      const idx = s.queue.indexOf(filename);
      if (idx === -1) return;
      s.queue.splice(idx, 1);
      io.to(roomId).emit('queue:updated', { queue: s.queue });
    });

    socket.on('queue:reorder', ({ fromIndex, toIndex }) => {
      const s = getRoom(roomId);
      const q = s.queue;
      if (
        fromIndex < 0 || fromIndex >= q.length ||
        toIndex < 0 || toIndex >= q.length
      ) return;
      const [item] = q.splice(fromIndex, 1);
      q.splice(toIndex, 0, item);
      io.to(roomId).emit('queue:updated', { queue: s.queue });
    });

    // Guard against every client firing this simultaneously when a video ends
    socket.on('queue:next', () => {
      const s = getRoom(roomId);
      if (s.advancingQueue) return;
      s.advancingQueue = true;
      setTimeout(() => { s.advancingQueue = false; }, 1000);

      if (s.queue.length === 0) {
        s.currentFilename = null;
        s.position = 0;
        s.isPlaying = false;
        io.to(roomId).emit('video:changed', { filename: null, position: 0 });
        return;
      }

      const next = s.queue.shift();
      s.currentFilename = next;
      s.position = 0;
      s.positionUpdatedAt = Date.now();
      s.isPlaying = false;
      io.to(roomId).emit('video:changed', { filename: next, position: 0 });
      io.to(roomId).emit('queue:updated', { queue: s.queue });
    });

    // ── Re-sync on demand ──────────────────────────────────────────────────

    socket.on('request-state', () => {
      const s = getRoom(roomId);
      socket.emit('state', {
        currentFilename: s.currentFilename,
        position: getCurrentPosition(roomId),
        isPlaying: s.isPlaying,
        queue: s.queue,
      });
    });

    // ── Cleanup ────────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id} from room ${roomId}`);
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (!roomSockets || roomSockets.size === 0) {
        deleteRoom(roomId);
        console.log(`[room] deleted: ${roomId}`);
      } else {
        // Notify remaining users about updated occupancy
        emitRoomInfo(io, roomId);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
