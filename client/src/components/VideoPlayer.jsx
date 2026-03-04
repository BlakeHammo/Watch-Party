import { useRef, useEffect } from 'react';
import socket from '../socket';

const SEEK_THRESHOLD = 0.5; // seconds — ignore tiny drift
const SUPPRESS_MS = 300;    // ms to suppress echo events after programmatic action

export default function VideoPlayer({ currentFilename, position, isPlaying, fileMap }) {
  const videoRef = useRef(null);
  const suppressEvents = useRef(false);
  const suppressTimer = useRef(null);

  function suppress() {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressEvents.current = true;
    suppressTimer.current = setTimeout(() => {
      suppressEvents.current = false;
    }, SUPPRESS_MS);
  }

  // Apply server state when currentFilename / position / isPlaying changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !currentFilename) return;

    suppress();

    if (Math.abs(el.currentTime - position) > SEEK_THRESHOLD) {
      el.currentTime = position;
    }

    if (isPlaying) {
      el.play().catch(() => {
        // Autoplay blocked — user needs to interact with the page first
      });
    } else {
      el.pause();
    }
  }, [currentFilename, position, isPlaying]);

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

  // ── Render states ──────────────────────────────────────────────────────────

  if (!currentFilename) {
    return (
      <div className="player-empty">
        <p>No video loaded. Add one from your library.</p>
      </div>
    );
  }

  const blobUrl = fileMap.get(currentFilename);

  if (!blobUrl) {
    return (
      <div className="player-empty player-missing">
        <p><strong>"{currentFilename}"</strong> is not in your folder.</p>
        <p>Make sure everyone has the same files and open your folder again.</p>
      </div>
    );
  }

  return (
    <div className="player-wrapper">
      <video
        ref={videoRef}
        className="video-el"
        src={blobUrl}
        controls
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
        onEnded={onEnded}
      />
      <div className="player-title">{currentFilename}</div>
    </div>
  );
}
