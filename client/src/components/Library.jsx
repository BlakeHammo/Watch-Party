import { useState, useEffect } from 'react';
import axios from 'axios';
import socket from '../socket';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Library({ token, queue, currentVideo }) {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    fetchVideos();
  }, []);

  // Refresh library when an upload completes (Uploader doesn't call us directly,
  // so we poll for now — simplest approach without prop drilling a callback)
  useEffect(() => {
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchVideos() {
    try {
      const { data } = await axios.get('/api/videos', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVideos(data);
    } catch {
      // silently ignore — token may not be valid yet
    }
  }

  function addToQueue(videoId) {
    socket.emit('queue:add', { videoId });
  }

  async function deleteVideo(videoId) {
    try {
      await axios.delete(`/api/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch {
      alert('Delete failed');
    }
  }

  const inQueue = new Set(queue.map((v) => v.id));
  const currentId = currentVideo?.id;

  return (
    <div className="library">
      <h2>Library</h2>
      {videos.length === 0 && (
        <p className="empty-hint">No videos yet. Upload some above!</p>
      )}
      <ul className="library-list">
        {videos.map((v) => {
          const active = v.id === currentId;
          const queued = inQueue.has(v.id);
          return (
            <li key={v.id} className={`library-item ${active ? 'active' : ''}`}>
              <div className="library-info">
                <span className="library-name" title={v.originalName}>
                  {v.originalName}
                </span>
                <span className="library-meta">{formatSize(v.size)}</span>
              </div>
              <div className="library-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => addToQueue(v.id)}
                  disabled={active || queued}
                  title={active ? 'Currently playing' : queued ? 'In queue' : 'Add to queue'}
                >
                  {active ? 'Playing' : queued ? 'Queued' : '+ Queue'}
                </button>
                <a
                  className="btn btn-sm"
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => deleteVideo(v.id)}
                  disabled={active}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
