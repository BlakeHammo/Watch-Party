import { useRef, useEffect } from 'react';
import socket from '../socket';

const SEEK_THRESHOLD = 0.5; // seconds — ignore tiny drift
const SUPPRESS_MS = 300;    // ms to suppress echo events after programmatic action

export default function VideoPlayer({ currentVideo, position, isPlaying }) {
  const videoRef = useRef(null);
  const suppressEvents = useRef(false);
  const suppressTimer = useRef(null);

  // Helper: set suppressEvents for SUPPRESS_MS to absorb async browser events
  function suppress() {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressEvents.current = true;
    suppressTimer.current = setTimeout(() => {
      suppressEvents.current = false;
    }, SUPPRESS_MS);
  }

  // Apply server state whenever currentVideo / position / isPlaying changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !currentVideo) return;

    suppress();

    // Apply position if meaningfully different
    if (Math.abs(el.currentTime - position) > SEEK_THRESHOLD) {
      el.currentTime = position;
    }

    if (isPlaying) {
      el.play().catch(() => {
        // Autoplay blocked — browser requires user gesture; nothing we can do
      });
    } else {
      el.pause();
    }
  }, [currentVideo, position, isPlaying]);

  // ── User-triggered event handlers ─────────────────────────────────────────

  function onPlay() {
    if (suppressEvents.current) return;
    socket.emit('play', { position: videoRef.current.currentTime });
  }

  function onPause() {
    if (suppressEvents.current) return;
    socket.emit('pause', { position: videoRef.current.currentTime });
  }

  function onSeeked() {
    if (suppressEvents.current) return;
    socket.emit('seek', { position: videoRef.current.currentTime });
  }

  function onEnded() {
    socket.emit('queue:next', {});
  }

  // Position heartbeat every 5s while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const el = videoRef.current;
      if (el && !el.paused) {
        socket.emit('position:report', { position: el.currentTime });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  if (!currentVideo) {
    return (
      <div className="player-empty">
        <p>No video loaded. Add one from the library.</p>
      </div>
    );
  }

  const streamUrl = currentVideo.url;

  return (
    <div className="player-wrapper">
      <video
        ref={videoRef}
        className="video-el"
        src={streamUrl}
        controls
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
        onEnded={onEnded}
      />
      <div className="player-title">{currentVideo.originalName}</div>
    </div>
  );
}
