const rooms = new Map(); // roomId → RoomState

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      currentFilename: null,     // filename string e.g. "movie.mp4", or null
      position: 0,               // last known playback position in seconds
      isPlaying: false,
      queue: [],                 // ordered string[] of filenames
      positionUpdatedAt: Date.now(),
      advancingQueue: false,     // dedup flag — prevents all clients firing queue:next simultaneously
    });
  }
  return rooms.get(roomId);
}

function deleteRoom(roomId) {
  rooms.delete(roomId);
}

// Drift-compensated live position. While playing, add elapsed wall-clock time.
function getCurrentPosition(roomId) {
  const s = getRoom(roomId);
  if (!s.isPlaying) return s.position;
  const elapsed = (Date.now() - s.positionUpdatedAt) / 1000;
  return s.position + elapsed;
}

module.exports = { getRoom, deleteRoom, getCurrentPosition };
