import { useState, useRef } from 'react';

export default function Uploader({ token }) {
  const [files, setFiles] = useState([]); // [{ name, progress, status }]
  const inputRef = useRef(null);

  function handleFileChange(e) {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;

    const fileList = selected.map((f) => ({
      file: f,
      name: f.name,
      progress: 0,
      status: 'pending', // pending | uploading | done | error
    }));

    setFiles(fileList);
    uploadAll(fileList);
    // Reset input so same file can be re-selected after a failure
    e.target.value = '';
  }

  function uploadAll(fileList) {
    const formData = new FormData();
    fileList.forEach(({ file }) => formData.append('videos', file));

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      setFiles((prev) =>
        prev.map((f) => ({ ...f, progress: pct, status: 'uploading' }))
      );
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setFiles((prev) =>
          prev.map((f) => ({ ...f, progress: 100, status: 'done' }))
        );
        setTimeout(() => setFiles([]), 2500);
      } else {
        setFiles((prev) =>
          prev.map((f) => ({ ...f, status: 'error' }))
        );
      }
    };

    xhr.onerror = () => {
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'error' })));
    };

    xhr.open('POST', '/api/videos/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  }

  return (
    <div className="uploader">
      <h2>Upload Videos</h2>
      <button className="btn" onClick={() => inputRef.current.click()}>
        Choose Files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={handleFileChange}
      />

      {files.length > 0 && (
        <ul className="upload-list">
          {files.map((f, i) => (
            <li key={i} className={`upload-item status-${f.status}`}>
              <span className="upload-name">{f.name}</span>
              <div className="upload-bar-track">
                <div
                  className="upload-bar-fill"
                  style={{ width: `${f.progress}%` }}
                />
              </div>
              <span className="upload-pct">
                {f.status === 'done' ? '✓' : f.status === 'error' ? '✗' : f.progress === 100 ? '…' : `${f.progress}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
