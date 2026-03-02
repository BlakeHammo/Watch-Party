const state = {
  currentVideo: null,   // video metadata object or null
  position: 0,          // last known playback position in seconds
  isPlaying: false,
  queue: [],            // ordered array of video metadata objects
  positionUpdatedAt: Date.now(), // wall-clock ms when position was last set
};

// Calculate live position without a server-side timer.
// While playing, add elapsed wall-clock time to the last known position.
function getCurrentPosition() {
  if (!state.isPlaying) return state.position;
  const elapsed = (Date.now() - state.positionUpdatedAt) / 1000;
  return state.position + elapsed;
}

module.exports = { state, getCurrentPosition };
