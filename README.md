# Watch Party

Watch videos in sync with friends. Each person plays files from their own machine — no uploads, no cloud storage, no bandwidth costs. The server only handles real-time sync (play, pause, seek, queue).

**Live demo:** [https://watch-party-xd.up.railway.app](https://watch-party-xd.up.railway.app)

## How it works

1. Someone creates a room and shares the link
2. Everyone opens the same link and selects their local folder of videos
3. One person adds a video to the queue — it loads for everyone
4. Play, pause, seek, and queue changes sync instantly across all viewers

Video files never leave anyone's device. The server just passes around timestamps and filenames.

## Project structure

```
server/
  index.js           # Express + Socket.io setup
  state.js           # Per-room in-memory state (Map<roomId, RoomState>)
  socket-handlers.js # All real-time events (play/pause/seek/queue/room info)
  routes/
    rooms.js         # POST /api/rooms — creates a new room

client/src/
  App.jsx            # Root component, socket lifecycle, room routing
  socket.js          # Socket.io singleton
  components/
    Lobby.jsx        # Create or join a room
    FolderPicker.jsx # Opens a local folder, builds filename→blobURL map
    VideoPlayer.jsx  # <video> element driven by synced state
    Queue.jsx        # Drag-to-reorder queue, skip, remove
    Library.jsx      # Lists local files, adds to queue
```

## Notes

- Room state is in-memory and ephemeral — rooms are deleted when the last person leaves, and a server restart clears everything
- Each person must have the same video files locally (shared via USB, Drive, etc. beforehand)
- If a file isn't found in someone's folder, they see a clear message instead of a broken player
