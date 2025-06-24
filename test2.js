// Run this in browser console to test room creation specifically:
const WebSocket = require('ws');
console.log("🧪 Testing room creation specifically...");

const ws = new WebSocket('ws://164.92.122.50:3000');

ws.onopen = function() {
    console.log("✅ Connected, sending create_room message...");
    
    // Send the create_room message
    ws.send(JSON.stringify({
        type: "create_room",
        playerName: "DebugPlayer",
        settings: {
            maxPlayers: 4,
            turnTimeLimit: 30000
        }
    }));
    
    console.log("📤 create_room message sent, waiting for response...");
    
    // Set a timeout to check if we get stuck
    setTimeout(() => {
        console.log("⏰ 5 second timeout - checking status");
        console.log("WebSocket readyState:", ws.readyState);
    }, 5000);
    
    setTimeout(() => {
        console.log("⏰ 15 second timeout - likely hanging somewhere");
        console.log("Check server logs for the last 🟢 STEP message");
    }, 15000);
};

ws.onmessage = function(event) {
    console.log("📥 SUCCESS! Received response:", event.data);
    
    try {
        const data = JSON.parse(event.data);
        if (data.type === "room_joined") {
            console.log("🎉 Room creation completed successfully!");
            console.log("Room ID:", data.roomId);
            console.log("Player ID:", data.playerId);
        } else if (data.type === "error") {
            console.log("🔴 Room creation failed:", data.message);
        }
    } catch (e) {
        console.log("Response was not JSON:", event.data);
    }
};

ws.onerror = function(error) {
    console.log("❌ WebSocket error during room creation test:", error);
};

ws.onclose = function(event) {
    console.log("🔌 Connection closed:", event.code, event.reason);
};