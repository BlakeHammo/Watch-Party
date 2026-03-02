import { useState, useEffect } from 'react';
import socket from './socket';
import Login from './components/Login';
import VideoPlayer from './components/VideoPlayer';
import Queue from './components/Queue';
import Library from './components/Library';
import Uploader from './components/Uploader';
import './App.css';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [connected, setConnected] = useState(false);

  // Party state (managed here so all components share it)
  const [currentVideo, setCurrentVideo] = useState(null);
  const [position, setPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  // Connect socket once we have a token
  useEffect(() => {
    if (!token) return;

    socket.auth = { token };
    socket.connect();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('state', ({ currentVideo, position, isPlaying, queue }) => {
      setCurrentVideo(currentVideo);
      setPosition(position);
      setIsPlaying(isPlaying);
      setQueue(queue);
    });

    socket.on('play', ({ position }) => {
      setPosition(position);
      setIsPlaying(true);
    });

    socket.on('pause', ({ position }) => {
      setPosition(position);
      setIsPlaying(false);
    });

    socket.on('seek', ({ position }) => {
      setPosition(position);
    });

    socket.on('queue:updated', ({ queue }) => {
      setQueue(queue);
    });

    socket.on('video:changed', ({ video, position }) => {
      setCurrentVideo(video);
      setPosition(position);
      setIsPlaying(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('state');
      socket.off('play');
      socket.off('pause');
      socket.off('seek');
      socket.off('queue:updated');
      socket.off('video:changed');
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
            currentVideo={currentVideo}
            position={position}
            isPlaying={isPlaying}
          />
          <Queue queue={queue} />
        </section>

        <aside className="sidebar">
          <Uploader token={token} />
          <Library token={token} queue={queue} currentVideo={currentVideo} />
        </aside>
      </main>
    </div>
  );
}
