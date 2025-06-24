let ws = null;
let currentPlayer = null;
let currentRoom = null;
let isCreator = false;
let gameState = null;
let gameTimer = null;
let lastSentWord = '';

// Add debugging flag
const DEBUG = true;
function debugLog(message, ...args) {
    if (DEBUG) {
        console.log(`🔍 [FRONTEND] ${message}`, ...args);
    }
}

// WebSocket connection with status indicator
async function connectWebSocket() {
    const wsUrl = "ws://164.92.122.50:3000";
    debugLog('Starting WebSocket connection to:', wsUrl);
    updateConnectionStatus('connecting');
    
    try {
        debugLog('Creating new WebSocket instance...');
        ws = new WebSocket(wsUrl);
        debugLog('WebSocket instance created, readyState:', ws.readyState);
        
        ws.onopen = () => {
            debugLog('🎉 WebSocket ONOPEN event fired');
            debugLog('WebSocket readyState:', ws.readyState);
            debugLog('WebSocket URL:', ws.url);
            debugLog('WebSocket protocol:', ws.protocol);
            updateConnectionStatus('connected');
            showMessage('Connected to server', 'success');
        };
        
        ws.onmessage = (event) => {
            debugLog('📥 WebSocket ONMESSAGE event fired');
            debugLog('Raw event data:', event.data);
            debugLog('Event type:', event.type);
            debugLog('Event target readyState:', event.target.readyState);
            
            try {
                const message = JSON.parse(event.data);
                debugLog('✅ JSON parse successful:', message);
                handleServerMessage(message);
            } catch (e) {
                debugLog('❌ JSON parse failed:', e);
                debugLog('Failed data:', event.data);
                console.error('Failed to parse message:', e);
            }
        };
        
        ws.onclose = (event) => {
            debugLog('🔌 WebSocket ONCLOSE event fired');
            debugLog('Close code:', event.code);
            debugLog('Close reason:', event.reason);
            debugLog('Was clean:', event.wasClean);
            debugLog('WebSocket readyState:', ws.readyState);
            updateConnectionStatus('disconnected');
            showMessage('Disconnected from server', 'error');
            setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
            debugLog('❌ WebSocket ONERROR event fired');
            debugLog('Error object:', error);
            debugLog('Error type:', error.type);
            debugLog('WebSocket readyState:', ws ? ws.readyState : 'ws is null');
            updateConnectionStatus('disconnected');
            showMessage('Connection error', 'error');
            console.error('WebSocket error:', error);
        };
        
        debugLog('✅ All WebSocket event handlers attached');
        
    } catch (error) {
        debugLog('💥 Exception creating WebSocket:', error);
        debugLog('Error name:', error.name);
        debugLog('Error message:', error.message);
        updateConnectionStatus('disconnected');
        showMessage('Failed to connect', 'error');
        setTimeout(connectWebSocket, 3000);
    }
}

// Update connection status indicator
function updateConnectionStatus(status) {
    debugLog('Updating connection status to:', status);
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.className = `connection-status ${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        debugLog('Status element updated successfully');
    } else {
        debugLog('❌ Status element not found');
    }
}

// Message handling - server-driven architecture
function handleServerMessage(message) {
    debugLog('🔄 handleServerMessage called with:', message);
    debugLog('Message type:', message.type);
    
    const handlers = {
        room_joined: (msg) => {
            debugLog('📍 Handling room_joined message:', msg);
            const playerNameEl = document.getElementById('playerName');
            if (!playerNameEl) {
                debugLog('❌ playerName element not found');
                return;
            }
            
            currentPlayer = { id: msg.playerId, name: playerNameEl.value };
            currentRoom = msg.roomId;
            isCreator = msg.isCreator;
            
            debugLog('✅ Player state updated:', { currentPlayer, currentRoom, isCreator });
            
            const roomIdEl = document.getElementById('currentRoomId');
            if (roomIdEl) {
                roomIdEl.textContent = msg.roomId;
                debugLog('✅ Room ID display updated');
            } else {
                debugLog('❌ currentRoomId element not found');
            }
            
            updateLobbyPlayers(msg.players);
            showScreen('lobbyScreen');
            
            if (isCreator) {
                const settingsEl = document.getElementById('gameSettings');
                const startBtnEl = document.getElementById('startGameBtn');
                if (settingsEl) {
                    settingsEl.classList.remove('hidden');
                    debugLog('✅ Game settings shown');
                } else {
                    debugLog('❌ gameSettings element not found');
                }
                if (startBtnEl) {
                    startBtnEl.classList.remove('hidden');
                    debugLog('✅ Start button shown');
                } else {
                    debugLog('❌ startGameBtn element not found');
                }
            }
        },
        
        player_joined: (msg) => {
            debugLog('📍 Handling player_joined message:', msg);
            showMessage(`${msg.player.name} joined the game`, 'info');
            updateLobbyPlayers(msg.players);
        },
        
        player_left: (msg) => {
            debugLog('📍 Handling player_left message:', msg);
            showMessage(`${msg.playerName} left the game`, 'info');
            updateLobbyPlayers(msg.players);
        },
        
        game_summary: (msg) => {
            debugLog('📍 Handling game_summary message:', msg);
            gameState = msg;
            updateGameDisplay(msg);
            
            const wordInput = document.getElementById('wordInput');
            const isMyTurn = msg.turn === currentPlayer.id;
            if (wordInput && isMyTurn && !wordInput.disabled) {
                const currentWord = wordInput.value.trim();
                if (currentWord !== lastSentWord) {
                    sendWordUpdate(currentWord);
                    lastSentWord = currentWord;
                }
            }
        },
        
        game_started: (msg) => {
            debugLog('📍 Handling game_started message:', msg);
            showMessage('Game started!', 'success');
            showScreen('gameScreen');
            gameState = null;
        },
        
        prompt: (msg) => {
            debugLog('📍 Handling prompt message:', msg);
            displayPrompt(msg.prompt);
            resetWordInput();
        },
        
        round_ended: (msg) => {
            debugLog('📍 Handling round_ended message:', msg);
            clearGameTimer();
        },
        
        game_finished: (msg) => {
            debugLog('📍 Handling game_finished message:', msg);
            clearGameTimer();
            displayFinalResults(msg);
        },
        
        room_reset: () => {
            debugLog('📍 Handling room_reset message');
            showMessage('Room reset - ready for new game', 'info');
            showScreen('lobbyScreen');
            gameState = null;
        },
        
        settings_updated: (msg) => {
            debugLog('📍 Handling settings_updated message:', msg);
            updateSettingsDisplay(msg.settings);
        },
        
        error: (msg) => {
            debugLog('📍 Handling error message:', msg);
            showMessage(msg.message, 'error');
        }
    };

    if (handlers[message.type]) {
        debugLog(`✅ Found handler for message type: ${message.type}`);
        try {
            handlers[message.type](message);
            debugLog(`✅ Handler completed for: ${message.type}`);
        } catch (error) {
            debugLog(`💥 Exception in handler for ${message.type}:`, error);
        }
    } else {
        debugLog(`❌ No handler found for message type: ${message.type}`);
        debugLog('Available handlers:', Object.keys(handlers));
    }
}

// Utility functions
const sendMessage = (message) => {
    debugLog('📤 sendMessage called with:', message);
    debugLog('WebSocket state check - ws exists:', !!ws);
    
    if (ws) {
        debugLog('WebSocket readyState:', ws.readyState);
        debugLog('WebSocket.OPEN constant:', WebSocket.OPEN);
        debugLog('Ready state comparison:', ws.readyState === WebSocket.OPEN);
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            const messageString = JSON.stringify(message);
            debugLog('📤 Sending JSON string:', messageString);
            debugLog('📤 JSON string length:', messageString.length);
            
            ws.send(messageString);
            debugLog('✅ Message sent successfully');
        } catch (error) {
            debugLog('💥 Exception sending message:', error);
            showMessage('Error sending message', 'error');
        }
    } else {
        debugLog('❌ Cannot send message - WebSocket not ready');
        debugLog('WebSocket state:', ws ? ws.readyState : 'ws is null');
        showMessage('Not connected to server', 'error');
    }
};

function sendWordUpdate(word) {
    debugLog('📝 sendWordUpdate called with word:', word);
    sendMessage({
        type: 'word_update',
        word: word
    });
}

// ... (keeping the rest of your existing functions for brevity)
// But let's add debugging to the key functions:

async function createRoom() {
    debugLog('🎮 createRoom function called');
    
    const playerNameEl = document.getElementById('playerName');
    debugLog('playerName element found:', !!playerNameEl);
    
    if (!playerNameEl) {
        debugLog('❌ playerName element not found, aborting');
        return;
    }
    
    const playerName = playerNameEl.value.trim();
    debugLog('Player name extracted:', `"${playerName}"`);
    debugLog('Player name length:', playerName.length);
    
    if (!playerName) {
        debugLog('❌ Empty player name, showing error');
        return showMessage('Please enter your name', 'error');
    }
    
    debugLog('✅ Player name valid, connecting WebSocket...');
    await connectWebSocket();
    
    debugLog('WebSocket connection attempt completed, setting timeout...');
    setTimeout(() => {
        debugLog('📤 Timeout fired, sending create_room message...');
        
        const message = {
            type: 'create_room',
            playerName: playerName,
            settings: {}  // Added this!
        };
        
        debugLog('💾 Message to send:', message);
        sendMessage(message);
    }, 100);
    
    debugLog('✅ createRoom function completed');
}

function joinRoom() {
    debugLog('🚪 joinRoom function called');
    
    const playerNameEl = document.getElementById('playerName');
    const roomIdEl = document.getElementById('roomIdInput');
    
    debugLog('Elements found - playerName:', !!playerNameEl, 'roomId:', !!roomIdEl);
    
    if (!playerNameEl || !roomIdEl) {
        debugLog('❌ Required elements not found');
        return;
    }
    
    const playerName = playerNameEl.value.trim();
    const roomId = roomIdEl.value.trim().toUpperCase();
    
    debugLog('Extracted values - playerName:', `"${playerName}"`, 'roomId:', `"${roomId}"`);
    
    if (!playerName) {
        debugLog('❌ Empty player name');
        return showMessage('Please enter your name', 'error');
    }
    if (!roomId) {
        debugLog('❌ Empty room ID');
        return showMessage('Please enter room code', 'error');
    }
    
    debugLog('✅ Values valid, connecting...');
    connectWebSocket();
    setTimeout(() => {
        debugLog('📤 Sending join_room message...');
        sendMessage({
            type: 'join_room',
            roomId: roomId,
            playerName: playerName,
        });
    }, 100);
}

function showMessage(text, type = 'info') {
    debugLog(`💬 showMessage: "${text}" (${type})`);
    
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) {
        debugLog('❌ messageContainer not found');
        return;
    }
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    messageContainer.appendChild(message);
    
    debugLog('✅ Message element created and added');
    
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
            debugLog('✅ Message removed after timeout');
        }
    }, 5000);
}

function showScreen(screenId) {
    debugLog(`📺 showScreen called with: ${screenId}`);
    
    const allScreens = document.querySelectorAll('.screen');
    debugLog('Total screens found:', allScreens.length);
    
    allScreens.forEach(screen => {
        screen.classList.remove('active');
        debugLog('Removed active from:', screen.id);
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        debugLog('✅ Activated screen:', screenId);
    } else {
        debugLog('❌ Target screen not found:', screenId);
    }
}

// Add the rest of your existing functions here...
// For now, let's add basic versions of the missing functions:

function updateLobbyPlayers(players) {
    debugLog('👥 updateLobbyPlayers called with:', players);
    // Your existing code here
}

function updateGameDisplay(gameState) {
    debugLog('🎮 updateGameDisplay called with:', gameState);
    // Your existing code here
}

function displayPrompt(prompt) {
    debugLog('💭 displayPrompt called with:', prompt);
    // Your existing code here
}

function resetWordInput() {
    debugLog('🔄 resetWordInput called');
    // Your existing code here
}

function clearGameTimer() {
    debugLog('⏰ clearGameTimer called');
    // Your existing code here
}

function displayFinalResults(results) {
    debugLog('🏆 displayFinalResults called with:', results);
    // Your existing code here
}

function updateSettingsDisplay(settings) {
    debugLog('⚙️ updateSettingsDisplay called with:', settings);
    // Your existing code here
}

// DOMContentLoaded event with debugging
document.addEventListener('DOMContentLoaded', () => {
    debugLog('🚀 DOMContentLoaded event fired');
    debugLog('Document ready state:', document.readyState);
    
    // Your existing DOMContentLoaded code here...
    
    debugLog('✅ DOMContentLoaded setup completed');
});

window.addEventListener('load', () => {
    debugLog('🌍 Window load event fired');
    updateConnectionStatus('disconnected');
    debugLog('✅ Initial connection status set');
});