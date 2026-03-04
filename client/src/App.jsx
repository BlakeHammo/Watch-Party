import { useState, useEffect } from 'react';
import axios from 'axios';
import socket from './socket';
import Login from './components/Login';
import VideoPlayer from './components/VideoPlayer';
import Queue from './components/Queue';
import Library from './components/Library';
import FolderPicker from './components/FolderPicker';
import './App.css';

// Redirect to login on expired/invalid token
axios.interceptors.response.use(null, (err) => {
  if (err.response?.status === 401 || err.response?.status === 403) {
    localStorage.removeItem('token');
    window.location.reload();
  }
  return Promise.reject(err);
});

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [connected, setConnected] = useState(false);
  const [fileMap, setFileMap] = useState(new Map());

  // Party state
  const [currentFilename, setCurrentFilename] = useState(null);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  // Connect socket once we have a token — store handler refs for clean removal
  useEffect(() => {
    if (!token) return;

    socket.auth = { token };
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

    const onQueueUpdated  = ({ queue })              => setQueue(queue);
    const onVideoChanged  = ({ filename, position }) => {
      setCurrentFilename(filename);
      setPosition(position);
      setIsPlaying(false);
    };

    socket.on('connect',       onConnect);
    socket.on('disconnect',    onDisconnect);
    socket.on('state',         onState);
    socket.on('play',          onPlay);
    socket.on('pause',         onPause);
    socket.on('seek',          onSeek);
    socket.on('queue:updated', onQueueUpdated);
    socket.on('video:changed', onVideoChanged);

    return () => {
      socket.off('connect',       onConnect);
      socket.off('disconnect',    onDisconnect);
      socket.off('state',         onState);
      socket.off('play',          onPlay);
      socket.off('pause',         onPause);
      socket.off('seek',          onSeek);
      socket.off('queue:updated', onQueueUpdated);
      socket.off('video:changed', onVideoChanged);
      socket.disconnect();
    };
  }, [token]);

  function handleLogin(newToken) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
    socket.disconnect();
  }

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Watch Party</h1>
        <div className="header-right">
          <span className={`conn-indicator ${connected ? 'conn-on' : 'conn-off'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
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
