import { useState } from 'react';

export default function Lobby({ setRoomId }) {
  const [joinInput, setJoinInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error('Server error');
      const { roomId } = await res.json();
      const link = `${window.location.origin}/room/${roomId}`;
      setCreatedLink(link);
      window.history.pushState({}, '', `/room/${roomId}`);
      setRoomId(roomId);
    } catch (e) {
      setError('Failed to create room. Is the server running?');
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    setError('');
    const input = joinInput.trim();
    // Accept either a full URL or just the 8-char room ID
    const match = input.match(/([a-f0-9]{8})(?:$|[^a-f0-9])/);
    if (!match) {
      setError('Invalid room link or ID. Room IDs are 8 hex characters.');
      return;
    }
    const roomId = match[1];
    window.history.pushState({}, '', `/room/${roomId}`);
    setRoomId(roomId);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="login-screen">
      <div className="login-card lobby-card">
        <h1>Watch Party</h1>
        <p className="lobby-subtitle">Watch videos in sync with friends.</p>

        <div className="lobby-section">
          <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create a room'}
          </button>
          {createdLink && (
            <div className="lobby-link-row">
              <span className="lobby-link">{createdLink}</span>
              <button className="btn btn-sm" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <div className="lobby-divider">or</div>

        <form className="lobby-section" onSubmit={handleJoin}>
          <input
            type="text"
            placeholder="Paste a room link or ID…"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
          />
          <button type="submit" className="btn btn-full">Join room</button>
        </form>

        {error && <p className="lobby-error">{error}</p>}
      </div>
    </div>
  );
}
