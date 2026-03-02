import { io } from 'socket.io-client';

// Singleton — created once, shared across the whole app.
// Token is injected after login via socket.auth before connect() is called.
const socket = io('/', {
  autoConnect: false,
  auth: { token: localStorage.getItem('token') || '' },
});

export default socket;
