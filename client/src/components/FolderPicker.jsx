import { useRef, useEffect } from 'react';

export default function FolderPicker({ fileMap, onFilesLoaded }) {
  const inputRef = useRef(null);

  // webkitdirectory must be set imperatively — React strips unknown JSX attributes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '');
    }
  }, []);

  function handleChange(e) {
    const files = Array.from(e.target.files).filter((f) =>
      f.type.startsWith('video/')
    );
    if (!files.length) return;

    const map = new Map();
    files.forEach((f) => {
      map.set(f.name, URL.createObjectURL(f));
    });

    onFilesLoaded(map);
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
