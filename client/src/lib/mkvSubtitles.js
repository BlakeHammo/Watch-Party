// Pure JS MKV subtitle extractor — no WASM, no eval, CSP-safe
// Parses Matroska (EBML) files and extracts text subtitle tracks as VTT blob URLs.
// Supports codecs: S_TEXT/UTF8 (plain/SRT text) and S_TEXT/ASS / S_TEXT/SSA.

// ── EBML element IDs ─────────────────────────────────────────────────────────

const ID = {
  Segment:       0x18538067,
  Info:          0x1549A966,
  TimecodeScale: 0x2AD7B1,
  Tracks:        0x1654AE6B,
  TrackEntry:    0xAE,
  TrackNumber:   0xD7,
  TrackType:     0x83,
  CodecID:       0x86,
  CodecPrivate:  0x63A2,
  Language:      0x22B59C,
  TrackName:     0x536E,
  Cluster:       0x1F43B675,
  Timestamp:     0xE7,
  SimpleBlock:   0xA3,
  BlockGroup:    0xA0,
  Block:         0xA1,
  BlockDuration: 0x9B,
};

const TRACK_TYPE_SUBTITLE = 0x11;

// ── EBML primitives ──────────────────────────────────────────────────────────

// Read an EBML element ID (variable-width, marker bit included in value).
function readId(view, pos) {
  if (pos >= view.byteLength) return null;
  const b = view.getUint8(pos);
  if (b & 0x80) return { value: b, width: 1 };
  if (b & 0x40) return { value: (b << 8)  | view.getUint8(pos + 1), width: 2 };
  if (b & 0x20) return { value: (b << 16) | (view.getUint8(pos + 1) << 8) | view.getUint8(pos + 2), width: 3 };
  if (b & 0x10) return { value: ((b << 24) | (view.getUint8(pos + 1) << 16) | (view.getUint8(pos + 2) << 8) | view.getUint8(pos + 3)) >>> 0, width: 4 };
  return null;
}

// Read an EBML data size (variable-width, marker bit stripped).
// Returns -1 for "unknown size" (all data bits set).
function readSize(view, pos) {
  if (pos >= view.byteLength) return null;
  const b = view.getUint8(pos);
  let width = 1, mask = 0x80;
  while (!(b & mask) && mask > 0) { width++; mask >>= 1; }
  if (!mask || width > 8) return null;

  let val = b & (mask - 1);
  let allOnes = (val === mask - 1);
  for (let i = 1; i < width; i++) {
    const byte = view.getUint8(pos + i);
    val = val * 256 + byte;
    if (byte !== 0xFF) allOnes = false;
  }
  return { value: allOnes ? -1 : val, width };
}

// Read an unsigned integer from element data (up to 7 bytes safe).
function readUInt(view, pos, size) {
  let val = 0;
  for (let i = 0; i < Math.min(size, 7); i++) val = val * 256 + view.getUint8(pos + i);
  return val;
}

const decoder = new TextDecoder();

function readString(view, pos, size) {
  return decoder.decode(new Uint8Array(view.buffer, view.byteOffset + pos, size)).replace(/\0+$/, '');
}

// Iterate over all EBML child elements within [start, end).
function* iterElements(view, start, end) {
  let pos = start;
  const limit = Math.min(end, view.byteLength);
  while (pos < limit) {
    const idResult = readId(view, pos);
    if (!idResult) break;
    pos += idResult.width;

    const szResult = readSize(view, pos);
    if (!szResult) break;
    pos += szResult.width;

    const dataSize = szResult.value === -1 ? (limit - pos) : szResult.value;
    if (dataSize < 0 || pos + dataSize > view.byteLength + 1) break;

    yield { id: idResult.value, dataPos: pos, dataSize };
    pos += dataSize;
  }
}

// ── MKV parsers ──────────────────────────────────────────────────────────────

function parseTracks(view, pos, size) {
  const subtitleTracks = [];
  for (const el of iterElements(view, pos, pos + size)) {
    if (el.id !== ID.TrackEntry) continue;
    let num = 0, type = 0, codec = '', lang = '', name = '', codecPrivate = '';
    for (const f of iterElements(view, el.dataPos, el.dataPos + el.dataSize)) {
      switch (f.id) {
        case ID.TrackNumber:  num          = readUInt(view, f.dataPos, f.dataSize); break;
        case ID.TrackType:    type         = readUInt(view, f.dataPos, f.dataSize); break;
        case ID.CodecID:      codec        = readString(view, f.dataPos, f.dataSize); break;
        case ID.Language:     lang         = readString(view, f.dataPos, f.dataSize); break;
        case ID.TrackName:    name         = readString(view, f.dataPos, f.dataSize); break;
        case ID.CodecPrivate: codecPrivate = readString(view, f.dataPos, f.dataSize); break;
      }
    }
    if (type === TRACK_TYPE_SUBTITLE) subtitleTracks.push({ num, codec, lang, name, codecPrivate });
  }
  return subtitleTracks;
}

// Parse the ASS/SSA script header stored in a track's CodecPrivate element.
// Returns { fontFamily, fontSize, playResY, bold, italic } or null if not parseable.
function parseAssStyle(headerText) {
  if (!headerText) return null;
  const lines = headerText.split(/\r?\n/);
  let playResY = 288; // ASS default if unspecified
  let fontFamily = null, fontSize = null, bold = false, italic = false;
  let inStyles = false, formatFields = null, foundDefault = false;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[')) {
      inStyles = t === '[V4+ Styles]' || t === '[V4 Styles]';
    } else if (t.startsWith('PlayResY:')) {
      playResY = parseInt(t.split(':')[1]) || playResY;
    } else if (inStyles && t.startsWith('Format:')) {
      formatFields = t.slice(7).split(',').map(f => f.trim());
    } else if (inStyles && t.startsWith('Style:') && formatFields) {
      const values = t.slice(6).split(',').map(v => v.trim());
      const get = (field) => values[formatFields.indexOf(field)] ?? '';
      const styleName = get('Name');
      if (!foundDefault || styleName === 'Default') {
        fontFamily = get('Fontname') || fontFamily;
        fontSize   = parseFloat(get('Fontsize')) || fontSize;
        bold       = get('Bold')   === '-1' || get('Bold')   === '1';
        italic     = get('Italic') === '-1' || get('Italic') === '1';
        if (styleName === 'Default') foundDefault = true;
      }
    }
  }

  if (!fontFamily) return null;
  return { fontFamily, bold, italic };
}

// Parse the header of a SimpleBlock or Block.
// Returns { trackNum, relTime (ms units relative to cluster), headerSize (bytes) }.
function parseBlockHeader(view, pos) {
  const start = pos;
  const trackVInt = readSize(view, pos); // track number uses same VInt encoding as sizes
  if (!trackVInt) return null;
  pos += trackVInt.width;
  if (pos + 3 > view.byteLength) return null;
  const relTime = view.getInt16(pos, false); // big-endian signed
  pos += 3; // 2 bytes timestamp + 1 byte flags
  return { trackNum: trackVInt.value, relTime, headerSize: pos - start };
}

function getBlockText(view, el, header) {
  const textStart = el.dataPos + header.headerSize;
  const textSize  = el.dataSize - header.headerSize;
  if (textSize <= 0) return '';
  return decoder.decode(new Uint8Array(view.buffer, view.byteOffset + textStart, textSize)).trim();
}

// ── Subtitle text conversion ─────────────────────────────────────────────────

// Extract dialogue text from an MKV ASS block, converting basic formatting tags to VTT markup.
// MKV ASS block format: "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text"
function cleanAssText(block) {
  const parts = block.split(',');
  const text = parts.length >= 9 ? parts.slice(8).join(',') : block;
  return text
    .replace(/\{([^}]*)\}/g, (_, content) => {
      // Each {…} block can contain multiple \tag entries separated by backslash.
      // Convert the ones browsers understand via VTT cue payload markup.
      return content.split('\\').filter(Boolean).map(tag => {
        if (tag === 'b1' || tag === 'b-1') return '<b>';
        if (tag === 'b0')                  return '</b>';
        if (tag === 'i1' || tag === 'i-1') return '<i>';
        if (tag === 'i0')                  return '</i>';
        if (tag === 'u1')                  return '<u>';
        if (tag === 'u0')                  return '</u>';
        return ''; // positioning, colour, etc. — not supported in VTT, drop
      }).join('');
    })
    .replace(/\\N/gi, '\n')
    .replace(/\\n/gi, '\n')
    .replace(/\\h/g, '\u00A0')
    .trim();
}

function parseText(raw, codec) {
  if (codec.includes('ASS') || codec.includes('SSA')) return cleanAssText(raw);
  return raw.replace(/\r\n/g, '\n').trim();
}

// ── VTT building ─────────────────────────────────────────────────────────────

function toVttTime(ms) {
  if (ms < 0) ms = 0;
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  const s  = Math.floor((ms % 60_000) / 1_000);
  const f  = Math.round(ms % 1_000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(f).padStart(3,'0')}`;
}

function buildVtt(cues, style) {
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end < 0) {
      cues[i].end = i + 1 < cues.length ? cues[i + 1].start : cues[i].start + 3000;
    }
    if (cues[i].end <= cues[i].start) cues[i].end = cues[i].start + 3000;
  }

  let header = 'WEBVTT\n\n';

  if (style) {
    // Set font-family and weight/style from the ASS Default style.
    // Font-size is intentionally omitted — vh units behave poorly in fullscreen
    // and the browser's default VTT size already scales well with the video.
    const lines = [`  font-family: '${style.fontFamily}', sans-serif;`];
    if (style.bold)   lines.push('  font-weight: bold;');
    if (style.italic) lines.push('  font-style: italic;');
    header += `STYLE\n::cue {\n${lines.join('\n')}\n}\n\n`;
  }

  return header + cues.map(c => `${toVttTime(c.start)} --> ${toVttTime(c.end)}\n${c.text}`).join('\n\n') + '\n';
}

// ── Block processing helper ───────────────────────────────────────────────────

function processBlock(view, blockEl, clusterTime, timecodeScale, trackMap, durationUnits) {
  const header = parseBlockHeader(view, blockEl.dataPos);
  if (!header) return;
  const track = trackMap.get(header.trackNum);
  if (!track) return;

  const startMs = Math.round((clusterTime + header.relTime) * timecodeScale / 1e6);
  const endMs   = durationUnits >= 0 ? Math.round(startMs + durationUnits * timecodeScale / 1e6) : -1;

  const rawText = getBlockText(view, blockEl, header);
  if (!rawText) return;
  const text = parseText(rawText, track.codec);
  if (text) track.cues.push({ start: startMs, end: endMs, text });
}

// ── Public API ───────────────────────────────────────────────────────────────

const SIZE_LIMIT = 2 * 1024 ** 3; // 2 GB

/**
 * Extract subtitle tracks from an MKV file.
 * @param {File} file  A File object (from the browser File API).
 * @returns {Promise<Array<{label: string, url: string}>>}  Blob URLs for each subtitle track in VTT format.
 */
export async function extractMkvSubtitles(file) {
  if (file.size > SIZE_LIMIT) {
    throw Object.assign(new Error('File too large (limit 2 GB)'), { code: 'TOO_LARGE' });
  }

  const buffer = await file.arrayBuffer();
  const view   = new DataView(buffer);

  // Verify EBML signature
  const firstId = readId(view, 0);
  if (!firstId || firstId.value !== 0x1A45DFA3) {
    throw Object.assign(new Error('Not a valid MKV/EBML file'), { code: 'INVALID' });
  }

  // Locate Segment element
  let segStart = -1, segEnd = view.byteLength;
  for (const el of iterElements(view, 0, view.byteLength)) {
    if (el.id === ID.Segment) {
      segStart = el.dataPos;
      if (el.dataSize !== view.byteLength - el.dataPos) segEnd = el.dataPos + el.dataSize;
      break;
    }
  }
  if (segStart === -1) throw new Error('No Segment element found');

  // Pass 1 — find Tracks and TimecodeScale (always near the start, before any Clusters)
  let subtitleTracks = [];
  let timecodeScale  = 1_000_000; // default: 1 ms per timecode unit

  for (const el of iterElements(view, segStart, segEnd)) {
    if (el.id === ID.Info) {
      for (const f of iterElements(view, el.dataPos, el.dataPos + el.dataSize)) {
        if (f.id === ID.TimecodeScale) timecodeScale = readUInt(view, f.dataPos, f.dataSize);
      }
    } else if (el.id === ID.Tracks) {
      subtitleTracks = parseTracks(view, el.dataPos, el.dataSize);
    } else if (el.id === ID.Cluster && subtitleTracks.length > 0) {
      break; // Tracks always precede Clusters — stop early once we have what we need
    }
  }

  if (subtitleTracks.length === 0) return [];

  // Pass 2 — scan all Clusters and collect subtitle cues
  const trackMap = new Map(subtitleTracks.map(t => [t.num, { ...t, cues: [] }]));
  let clusterTime = 0;

  for (const el of iterElements(view, segStart, segEnd)) {
    if (el.id !== ID.Cluster) continue;

    for (const cEl of iterElements(view, el.dataPos, el.dataPos + el.dataSize)) {
      if (cEl.id === ID.Timestamp) {
        clusterTime = readUInt(view, cEl.dataPos, cEl.dataSize);
      } else if (cEl.id === ID.SimpleBlock) {
        processBlock(view, cEl, clusterTime, timecodeScale, trackMap, -1);
      } else if (cEl.id === ID.BlockGroup) {
        let blockEl = null, duration = -1;
        for (const bEl of iterElements(view, cEl.dataPos, cEl.dataPos + cEl.dataSize)) {
          if (bEl.id === ID.Block)         blockEl  = bEl;
          else if (bEl.id === ID.BlockDuration) duration = readUInt(view, bEl.dataPos, bEl.dataSize);
        }
        if (blockEl) processBlock(view, blockEl, clusterTime, timecodeScale, trackMap, duration);
      }
    }
  }

  // Build VTT blob URL for each track that has cues
  const results = [];
  let idx = 0;
  for (const track of trackMap.values()) {
    if (track.cues.length === 0) continue;
    idx++;
    const label = track.name ||
      (track.lang && track.lang !== 'und' ? `Track ${idx} (${track.lang})` : `Track ${idx}`);
    const style = (track.codec.includes('ASS') || track.codec.includes('SSA'))
      ? parseAssStyle(track.codecPrivate)
      : null;
    const vtt  = buildVtt(track.cues, style);
    const url  = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    results.push({ label, url });
  }
  return results;
}
