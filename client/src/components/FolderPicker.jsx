import { useRef, useEffect } from 'react';

const SUBTITLE_EXTS = ['srt', 'vtt'];

function fileExt(name) {
  return name.split('.').pop().toLowerCase();
}

async function buildSubtitleMap(files) {
  const map = new Map();
  for (const file of files) {
    const text = await file.text();
    let vtt = text;
    if (fileExt(file.name) === 'srt') {
      // Convert SRT timestamps (00:01:23,456) to VTT (00:01:23.456)
      vtt = 'WEBVTT\n\n' + text
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }
    const blob = new Blob([vtt], { type: 'text/vtt' });
    map.set(file.name, URL.createObjectURL(blob));
  }
  return map;
}

export default function FolderPicker({ fileMap, onFilesLoaded, onRawFilesLoaded, onSubtitlesLoaded }) {
  const inputRef = useRef(null);

  // webkitdirectory must be set imperatively — React strips unknown JSX attributes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '');
    }
  }, []);

  async function handleChange(e) {
    const allFiles = Array.from(e.target.files);

    const videoFiles = allFiles.filter((f) => f.type.startsWith('video/'));
    const subtitleFiles = allFiles.filter((f) => SUBTITLE_EXTS.includes(fileExt(f.name)));

    if (videoFiles.length) {
      const blobMap = new Map();
      const rawMap = new Map();
      videoFiles.forEach((f) => {
        blobMap.set(f.name, URL.createObjectURL(f));
        rawMap.set(f.name, f);
      });
      onFilesLoaded(blobMap);
      if (onRawFilesLoaded) onRawFilesLoaded(rawMap);
    }

    if (subtitleFiles.length && onSubtitlesLoaded) {
      const subMap = await buildSubtitleMap(subtitleFiles);
      onSubtitlesLoaded(subMap);
    }

    // Reset so the same folder can be re-selected if needed
    e.target.value = '';
  }

  const count = fileMap.size;

  return (
    <div className="folder-picker">
      <div className="folder-picker-header">
        <h2>Your Folder</h2>
        {count > 0 && (
          <span className="folder-count">{count} video{count !== 1 ? 's' : ''}</span>
        )}
      </div>

      {count === 0 ? (
        <p className="empty-hint">
          Open the folder containing your videos. Everyone needs the same files.
        </p>
      ) : (
        <p className="folder-ready">Folder loaded — ready to watch.</p>
      )}

      <button className="btn" onClick={() => inputRef.current.click()}>
        {count === 0 ? 'Open Folder' : 'Change Folder'}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={handleChange}
      />
    </div>
  );
}
