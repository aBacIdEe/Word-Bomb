const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoomManager = require('./models/roomManager');
const MessageHandler = require('./services/messageHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize services
const roomManager = new RoomManager();
const messageHandler = new MessageHandler(roomManager);

// WebSocket handling
wss.on('connection', (ws, req) => {
  messageHandler.handleConnection(ws, req);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  wss.clients.forEach(ws => {
    ws.send(JSON.stringify({
      type: 'server_shutdown',
      message: 'Server is shutting down'
    }));
    ws.close();
  });
  server.close();
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Word game server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});