import { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import VideoPlayer from './components/VideoPlayer';
import Queue from './components/Queue';
import Library from './components/Library';
import FolderPicker from './components/FolderPicker';
import './App.css';

function getRoomIdFromUrl() {
  const match = window.location.pathname.match(/^\/room\/([a-f0-9]{8})$/);
  return match ? match[1] : null;
}

export default function App() {
  const [roomId, setRoomId] = useState(getRoomIdFromUrl);
  const [connected, setConnected] = useState(false);
  const [fileMap, setFileMap] = useState(new Map());
  const [roomInfo, setRoomInfo] = useState({ count: 0, folderReadyCount: 0 });

  // Party state
  const [currentFilename, setCurrentFilename] = useState(null);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  // Connect socket once we have a roomId — store handler refs for clean removal
  useEffect(() => {
    if (!roomId) return;

    socket.io.opts.query = { roomId };
    socket.connect();

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onState = ({ currentFilename, position, isPlaying, queue }) => {
      setCurrentFilename(currentFilename);
      setPosition(position);
      setIsPlaying(isPlaying);
      setQueue(queue);
    };

    const onPlay  = ({ position }) => { setPosition(position); setIsPlaying(true); };
    const onPause = ({ position }) => { setPosition(position); setIsPlaying(false); };
    const onSeek  = ({ position }) => { setPosition(position); };

    const onQueueUpdated = ({ queue })              => setQueue(queue);
    const onVideoChanged = ({ filename, position }) => {
      setCurrentFilename(filename);
      setPosition(position);
      setIsPlaying(false);
    };
    const onRoomInfo = ({ count, folderReadyCount }) => setRoomInfo({ count, folderReadyCount });

    socket.on('connect',       onConnect);
    socket.on('disconnect',    onDisconnect);
    socket.on('state',         onState);
    socket.on('play',          onPlay);
    socket.on('pause',         onPause);
    socket.on('seek',          onSeek);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('video:changed', onVideoChanged);
    socket.on('room:info',     onRoomInfo);

    return () => {
      socket.off('connect',       onConnect);
      socket.off('disconnect',    onDisconnect);
      socket.off('state',         onState);
      socket.off('play',          onPlay);
      socket.off('pause',         onPause);
      socket.off('seek',          onSeek);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('video:changed', onVideoChanged);
      socket.off('room:info',     onRoomInfo);
      socket.disconnect();
    };
  }, [roomId]);

  // Announce folder readiness whenever fileMap is populated (or on reconnect)
  useEffect(() => {
    if (connected && fileMap.size > 0) {
      socket.emit('folder:ready');
    }
  }, [connected, fileMap]);

  if (!roomId) return <Lobby setRoomId={setRoomId} />;

  const allReady = roomInfo.count > 0 && roomInfo.folderReadyCount === roomInfo.count;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Watch Party</h1>
        <div className="header-right">
          {roomInfo.count > 0 && (
            <>
              <span className="room-stat">
                {roomInfo.count} {roomInfo.count === 1 ? 'person' : 'people'}
              </span>
              <span className={`room-stat files-stat ${allReady ? 'files-all-ready' : 'files-waiting'}`}>
                {allReady
                  ? 'All files loaded'
                  : `${roomInfo.folderReadyCount}/${roomInfo.count} files loaded`}
              </span>
            </>
          )}
          <span className={`conn-indicator ${connected ? 'conn-on' : 'conn-off'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button className="btn-ghost" onClick={() => {
            socket.disconnect();
            window.history.pushState({}, '', '/');
            setRoomId(null);
            setRoomInfo({ count: 0, folderReadyCount: 0 });
          }}>Leave Room</button>
        </div>
      </header>

      <main className="app-main">
        <section className="player-section">
          <VideoPlayer
            currentFilename={currentFilename}
            position={position}
            isPlaying={isPlaying}
            fileMap={fileMap}
          />
          <Queue queue={queue} />
        </section>

        <aside className="sidebar">
          <FolderPicker fileMap={fileMap} onFilesLoaded={setFileMap} />
          <Library fileMap={fileMap} queue={queue} currentFilename={currentFilename} />
        </aside>
      </main>
    </div>
  );
}
