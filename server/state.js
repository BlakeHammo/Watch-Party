const state = {
  currentFilename: null,     // filename string e.g. "movie.mp4", or null
  position: 0,               // last known playback position in seconds
  isPlaying: false,
  queue: [],                 // ordered string[] of filenames
  positionUpdatedAt: Date.now(),
  advancingQueue: false,     // dedup flag — prevents all clients firing queue:next simultaneously
};

// Drift-compensated live position. While playing, add elapsed wall-clock time.
function getCurrentPosition() {
  if (!state.isPlaying) return state.position;
  const elapsed = (Date.now() - state.positionUpdatedAt) / 1000;
  return state.position + elapsed;
}

module.exports = { state, getCurrentPosition };
