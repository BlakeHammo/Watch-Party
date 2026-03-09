import { useRef, useEffect, useState } from 'react';
import socket from '../socket';
import { extractMkvSubtitles } from '../lib/mkvSubtitles';

const SEEK_THRESHOLD = 0.5; // seconds — ignore tiny drift
const SUPPRESS_MS = 300;    // ms to suppress echo events after programmatic action
const SIZE_LIMIT_GB = 2;

export default function VideoPlayer({ currentFilename, position, isPlaying, fileMap, rawFileMap, subtitleMap }) {
  const videoRef = useRef(null);
  const suppressEvents = useRef(false);
  const suppressTimer = useRef(null);
  const [codecWarning, setCodecWarning] = useState(false);

  // Subtitle state
  const [extractedSubs, setExtractedSubs] = useState(new Map());
  const [activeSub, setActiveSub] = useState('none');
  // 'idle' | 'loading' | 'done' | 'none-found' | 'too-large' | 'error'
  const [extractState, setExtractState] = useState('idle');

  function suppress() {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressEvents.current = true;
    suppressTimer.current = setTimeout(() => { suppressEvents.current = false; }, SUPPRESS_MS);
  }

  // Reset all per-video state when the video changes
  useEffect(() => {
    setCodecWarning(false);
    setExtractedSubs(new Map());
    setActiveSub('none');
    setExtractState('idle');
  }, [currentFilename]);

  // Apply server state changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !currentFilename) return;
    suppress();
    if (Math.abs(el.currentTime - position) > SEEK_THRESHOLD) el.currentTime = position;
    if (isPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [currentFilename, position, isPlaying]);

  // Switch subtitle track when activeSub changes
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    Array.from(el.textTracks).forEach((track) => {
      track.mode = track.label === activeSub ? 'showing' : 'hidden';
    });
  }, [activeSub]);

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
    if (videoRef.current?.videoWidth === 0) setCodecWarning(true);
  }

  // Position heartbeat every 5s while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const el = videoRef.current;
      if (el && !el.paused) socket.emit('position:report', { position: el.currentTime });
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── MKV subtitle extraction (pure JS, no WASM) ────────────────────────────

  async function handleExtractSubtitles() {
    const file = rawFileMap?.get(currentFilename);
    if (!file) return;

    if (file.size / (1024 ** 3) > SIZE_LIMIT_GB) {
      setExtractState('too-large');
      return;
    }

    try {
      setExtractState('loading');
      const tracks = await extractMkvSubtitles(file);
      if (tracks.length === 0) {
        setExtractState('none-found');
        return;
      }
      setExtractedSubs(new Map(tracks.map(({ label, url }) => [label, url])));
      setExtractState('done');
    } catch (err) {
      console.error('[mkvSubtitles]', err);
      setExtractState(err.code === 'TOO_LARGE' ? 'too-large' : 'error');
    }
  }

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

  // Merge external subtitle files (.srt/.vtt from folder) with extracted subs
  const videoBase = currentFilename.replace(/\.[^.]+$/, '').toLowerCase();
  const externalSubs = subtitleMap
    ? [...subtitleMap.keys()].filter((f) => f.toLowerCase().startsWith(videoBase))
    : [];
  const allSubs = [
    ...externalSubs.map((name) => ({ label: name, url: subtitleMap.get(name) })),
    ...[...extractedSubs.entries()].map(([label, url]) => ({ label, url })),
  ];

  const isMkv = currentFilename.toLowerCase().endsWith('.mkv');

  const extractLabel = {
    idle:         'Extract subtitles',
    loading:      'Extracting…',
    done:         'Extracted',
    'none-found': 'No embedded subtitles',
    'too-large':  `File too large (limit ${SIZE_LIMIT_GB}GB)`,
    error:        'Extraction failed',
  }[extractState];

  const extractDisabled = extractState !== 'idle' && extractState !== 'error';

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
      >
        {allSubs.map(({ label, url }) => (
          <track key={label} kind="subtitles" label={label} src={url} />
        ))}
      </video>

      <div className="player-tracks">
        <label className="track-select">
          Subtitles
          <select value={activeSub} onChange={(e) => setActiveSub(e.target.value)}>
            <option value="none">Off</option>
            {allSubs.map(({ label }) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
        </label>
        {isMkv && (
          <button
            className="btn btn-sm"
            onClick={handleExtractSubtitles}
            disabled={extractDisabled}
            title="Extract subtitle tracks embedded in the MKV file"
          >
            {extractLabel}
          </button>
        )}
      </div>

      <div className="player-title">{currentFilename}</div>
    </div>
  );
}
