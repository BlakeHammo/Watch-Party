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

  // Persists the user's chosen language across videos, e.g. "eng"
  const preferredLang = useRef(null);
  // Set before auto-extraction; useEffect([extractedSubs]) reads it to auto-select
  const pendingAutoSelect = useRef(null);
  // Increments on every extraction start so stale .then() results are ignored
  const extractionId = useRef(0);
  // Always-current ref so the currentFilename effect can read the latest rawFileMap
  const rawFileMapRef = useRef(rawFileMap);
  rawFileMapRef.current = rawFileMap;

  function suppress() {
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressEvents.current = true;
    suppressTimer.current = setTimeout(() => { suppressEvents.current = false; }, SUPPRESS_MS);
  }

  // When the video changes: reset UI state, then auto-extract if we have a language preference
  useEffect(() => {
    setCodecWarning(false);
    setExtractedSubs(new Map());
    setActiveSub('none');
    setExtractState('idle');
    pendingAutoSelect.current = null;

    if (!preferredLang.current || !currentFilename?.toLowerCase().endsWith('.mkv')) return;

    const file = rawFileMapRef.current?.get(currentFilename);
    if (!file) return;

    // Mark which language to auto-select once tracks arrive
    pendingAutoSelect.current = preferredLang.current;

    // Stamp this extraction so a stale result from a previous video can't apply
    const myId = ++extractionId.current;
    setExtractState('loading');

    extractMkvSubtitles(file)
      .then((tracks) => {
        if (extractionId.current !== myId) return; // video changed before this finished
        if (tracks.length === 0) { setExtractState('none-found'); return; }
        setExtractedSubs(new Map(tracks.map(({ label, url }) => [label, url])));
        setExtractState('done');
        // Auto-selection is handled by useEffect([extractedSubs]) below
      })
      .catch((err) => {
        if (extractionId.current !== myId) return;
        console.error('[mkvSubtitles]', err);
        setExtractState(err.code === 'TOO_LARGE' ? 'too-large' : 'error');
      });
  }, [currentFilename]); // eslint-disable-line react-hooks/exhaustive-deps

  // After extractedSubs is committed to the DOM, apply any pending auto-selection.
  // This runs after the <option> elements exist, so the <select> value resolves correctly.
  useEffect(() => {
    if (!pendingAutoSelect.current || extractedSubs.size === 0) return;
    const lang = pendingAutoSelect.current;
    const match = [...extractedSubs.keys()].find((label) =>
      label.toLowerCase().includes(`(${lang})`)
    );
    if (match) {
      setActiveSub(match);
      pendingAutoSelect.current = null;
    }
  }, [extractedSubs]);

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

  // Save language preference when user picks a subtitle track.
  // Labels look like "Track 1 (eng)" — extract the 2-3 letter code.
  // Selecting "Off" clears the preference.
  function handleSubChange(e) {
    const val = e.target.value;
    setActiveSub(val);
    if (val === 'none') {
      preferredLang.current = null;
    } else {
      const langMatch = val.match(/\(([a-z]{2,3})\)$/i);
      if (langMatch) preferredLang.current = langMatch[1].toLowerCase();
    }
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

  // ── Manual MKV subtitle extraction ────────────────────────────────────────

  async function handleExtractSubtitles() {
    const file = rawFileMap?.get(currentFilename);
    if (!file) return;

    if (file.size / (1024 ** 3) > SIZE_LIMIT_GB) {
      setExtractState('too-large');
      return;
    }

    // Manual extraction: don't auto-select (let user choose), stamp to cancel stale auto
    pendingAutoSelect.current = null;
    const myId = ++extractionId.current;

    try {
      setExtractState('loading');
      const tracks = await extractMkvSubtitles(file);
      if (extractionId.current !== myId) return;
      if (tracks.length === 0) {
        setExtractState('none-found');
        return;
      }
      setExtractedSubs(new Map(tracks.map(({ label, url }) => [label, url])));
      setExtractState('done');
    } catch (err) {
      if (extractionId.current !== myId) return;
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
          <select value={activeSub} onChange={handleSubChange}>
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
