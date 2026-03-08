import { useRef, useEffect, useState } from 'react';
import socket from '../socket';

const SEEK_THRESHOLD = 0.5; // seconds — ignore tiny drift
const SUPPRESS_MS = 300;    // ms to suppress echo events after programmatic action

export default function VideoPlayer({ currentFilename, position, isPlaying, fileMap }) {
  const videoRef = useRef(null);
  const suppressEvents = useRef(false);
  const suppressTimer = useRef(null);
  const [codecWarning, setCodecWarning] = useState(false);

  function suppress() {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressEvents.current = true;
    suppressTimer.current = setTimeout(() => {
      suppressEvents.current = false;
    }, SUPPRESS_MS);
  }

  // Reset codec warning when the video changes
  useEffect(() => {
    setCodecWarning(false);
  }, [currentFilename]);

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

  function onLoadedMetadata() {
    // videoWidth is 0 when the browser can't decode the video track
    if (videoRef.current && videoRef.current.videoWidth === 0) {
      setCodecWarning(true);
    }
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
      {codecWarning && (
        <div className="player-codec-warning">
          Video track unsupported — your browser can't decode this file's codec. Audio is still
          synced. Try converting to MP4 (H.264) using{' '}
          <a href="https://handbrake.fr" target="_blank" rel="noreferrer">HandBrake</a>.
        </div>
      )}
      <video
        ref={videoRef}
        className="video-el"
        src={blobUrl}
        controls
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
        onEnded={onEnded}
        onLoadedMetadata={onLoadedMetadata}
      />
      <div className="player-title">{currentFilename}</div>
    </div>
  );
}
