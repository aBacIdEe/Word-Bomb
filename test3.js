// Run this test in browser console:

// import ws
// imports
const WebSocket = require('ws');

console.log("🧪 Testing if message events reach the server...");

const ws = new WebSocket('ws://164.92.122.50:3000');

ws.onopen = function() {
    console.log("✅ Connected");
    
    // Test 1: Send a simple test message
    console.log("📤 Test 1: Sending simple test message");
    ws.send(JSON.stringify({
        type: "test",
        message: "simple test"
    }));
    
    setTimeout(() => {
        // Test 2: Send the create_room message
        console.log("📤 Test 2: Sending create_room message");
        ws.send(JSON.stringify({
            type: "create_room",
            playerName: "TestPlayer",
            settings: {
                maxPlayers: 4,
                turnTimeLimit: 30000
            }
        }));
    }, 2000);
    
    setTimeout(() => {
        // Test 3: Send malformed message
        console.log("📤 Test 3: Sending malformed JSON");
        ws.send("{invalid json");
    }, 4000);
};

ws.onmessage = function(event) {
    console.log("📥 Browser received:", event.data);
};

ws.onerror = function(error) {
    console.log("❌ WebSocket error:", error);
};

ws.onclose = function(event) {
    console.log("🔌 Connection closed:", event.code, event.reason);
};