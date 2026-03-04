import socket from '../socket';

export default function Library({ fileMap, queue, currentFilename }) {
  const files = [...fileMap.keys()].sort();
  const inQueue = new Set(queue);

  function addToQueue(filename) {
    socket.emit('queue:add', { filename });
  }

  return (
    <div className="library">
      <h2>Library</h2>
      {files.length === 0 && (
        <p className="empty-hint">Open your video folder above to see your files.</p>
      )}
      <ul className="library-list">
        {files.map((filename) => {
          const active = filename === currentFilename;
          const queued = inQueue.has(filename);
          return (
            <li key={filename} className={`library-item ${active ? 'active' : ''}`}>
              <span className="library-name" title={filename}>{filename}</span>
              <div className="library-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => addToQueue(filename)}
                  disabled={active || queued}
                >
                  {active ? 'Playing' : queued ? 'Queued' : '+ Queue'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
