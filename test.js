// Run this in your browser console to test the complete flow:
// imports
const WebSocket = require('ws');

console.log("🚀 Starting WebSocket debugging test...");

const ws = new WebSocket('ws://164.92.122.50:3000');
let messagesSent = 0;
let messagesReceived = 0;

ws.onopen = function() {
    console.log("✅ WebSocket opened");
    
    // Send a simple test message first
    console.log("📤 Sending test message...");
    ws.send(JSON.stringify({
        type: "test",
        message: "Connection test"
    }));
    messagesSent++;
    
    // Wait a moment, then try to create a room
    setTimeout(() => {
        console.log("📤 Sending create_room message...");
        ws.send(JSON.stringify({
            type: "create_room",
            playerName: "TestPlayer",
            settings: {
                maxPlayers: 4,
                turnTimeLimit: 30000
            }
        }));
        messagesSent++;
        
        // Set a timeout to detect if we don't get a response
        setTimeout(() => {
            if (messagesReceived === 0) {
                console.log("⚠️ No response received after 10 seconds");
                console.log("Messages sent:", messagesSent);
                console.log("Messages received:", messagesReceived);
                console.log("WebSocket state:", ws.readyState);
            }
        }, 10000);
        
    }, 1000);
};

ws.onmessage = function(event) {
    messagesReceived++;
    console.log(`📥 Message ${messagesReceived} received:`, event.data);
    
    try {
        const data = JSON.parse(event.data);
        console.log("📥 Parsed data:", data);
        
        if (data.type === "room_joined") {
            console.log("🎉 Room creation successful!");
        } else if (data.type === "error") {
            console.log("🔴 Server error:", data.message);
        }
    } catch (e) {
        console.log("📥 Non-JSON message:", event.data);
    }
};

ws.onerror = function(error) {
    console.log("❌ WebSocket error:", error);
};

ws.onclose = function(event) {
    console.log("🔌 WebSocket closed:", event.code, event.reason);
    console.log("Final stats - Sent:", messagesSent, "Received:", messagesReceived);
};