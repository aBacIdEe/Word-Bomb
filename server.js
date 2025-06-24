const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoomManager = require('./models/roomManager');
const MessageHandler = require('./services/messageHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false  // Add this back to disable compression
});

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

// MODIFIED: Load word list before starting server
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Word game server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('Loading word list...');
    try {
        await roomManager.loadWordList();
        console.log('✅ Server ready - word list loaded and cached');
        console.log('🚀 Ready to accept connections!');
    } catch (error) {
        console.error('❌ Failed to load word list:', error);
        console.error('Server will exit because word list is required');
        process.exit(1);
    }
});