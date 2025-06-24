// Add this to your server.js for overall performance monitoring

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
    perMessageDeflate: false
});

// Performance monitoring middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(body) {
        const responseTime = Date.now() - startTime;
        console.log(`🌐 HTTP ${req.method} ${req.url} - ${res.statusCode} - ${responseTime}ms`);
        
        if (responseTime > 500) {
            console.log(`⚠️  Slow HTTP response: ${responseTime}ms for ${req.url}`);
        }
        
        return originalSend.call(this, body);
    };
    
    next();
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Monitor static file serving
app.use('/public', (req, res, next) => {
    console.log(`📁 Static file request: ${req.url}`);
    next();
});

app.get('/', (req, res) => {
    console.log('📄 Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize services
const roomManager = new RoomManager();
const messageHandler = new MessageHandler(roomManager);

// WebSocket connection monitoring
wss.on('connection', (ws, req) => {
    const connectionStart = Date.now();
    console.log(`🔌 New WebSocket connection from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    
    // Monitor WebSocket message frequency
    let messageCount = 0;
    let lastMessageTime = Date.now();
    
    const originalOn = ws.on.bind(ws);
    ws.on = function(event, listener) {
        if (event === 'message') {
            const wrappedListener = function(data) {
                messageCount++;
                const timeSinceLastMessage = Date.now() - lastMessageTime;
                lastMessageTime = Date.now();
                
                console.log(`📨 WS Message #${messageCount} (${timeSinceLastMessage}ms since last)`);
                
                return listener.call(this, data);
            };
            return originalOn(event, wrappedListener);
        }
        return originalOn(event, listener);
    };
    
    ws.on('close', () => {
        const connectionDuration = Date.now() - connectionStart;
        console.log(`🔌 WebSocket closed after ${connectionDuration}ms, ${messageCount} messages`);
    });
    
    messageHandler.handleConnection(ws, req);
});

// Monitor server health
setInterval(() => {
    const memUsage = process.memoryUsage();
    const activeConnections = wss.clients.size;
    const activeRooms = roomManager.getAllRooms().length;
    
    console.log(`📊 Server Health Check:`);
    console.log(`  Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used`);
    console.log(`  WebSocket connections: ${activeConnections}`);
    console.log(`  Active rooms: ${activeRooms}`);
    console.log(`  Uptime: ${Math.round(process.uptime())}s`);
}, 30000); // Every 30 seconds

// Monitor event loop lag
setInterval(() => {
    const start = Date.now();
    setImmediate(() => {
        const lag = Date.now() - start;
        if (lag > 10) {
            console.log(`⚠️  Event loop lag detected: ${lag}ms`);
        }
    });
}, 5000); // Every 5 seconds

const PORT = 3000;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Word game server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('Loading word list...');
    const wordLoadStart = Date.now();
    try {
        await roomManager.loadWordList();
        const wordLoadTime = Date.now() - wordLoadStart;
        console.log(`✅ Server ready - word list loaded in ${wordLoadTime}ms`);
        console.log('🚀 Ready to accept connections!');
    } catch (error) {
        console.error('❌ Failed to load word list:', error);
        process.exit(1);
    }
});