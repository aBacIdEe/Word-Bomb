let ws = null;
let currentPlayer = null;
let currentRoom = null;
let isCreator = false;
let gameState = null;
let gameTimer = null;
let lastSentWord = '';
let pendingMessage = null;

// WebSocket connection with automatic URL detection
async function connectWebSocket() {
    // Automatically build WebSocket URL from current page location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // includes port if not 80/443
    const wsUrl = `${protocol}//${host}`;
    
    console.log('Connecting to:', wsUrl);
    updateConnectionStatus('connecting');
    
    try {
        ws = new WebSocket(wsUrl);
        
        // Optional connection timeout (10 seconds is very safe)
        const connectionTimeout = setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                console.log('Connection timeout after 10 seconds');
                ws.close();
                showMessage('Connection timeout - please try again', 'error');
            }
        }, 10000);
        
        ws.onopen = () => {
            clearTimeout(connectionTimeout);
            console.log("WebSocket connected successfully");
            updateConnectionStatus('connected');
            showMessage('Connected to server', 'success');
            
            // Send any pending message
            if (pendingMessage) {
                console.log('Sending pending message:', pendingMessage);
                sendMessage(pendingMessage);
                pendingMessage = null;
            }
        };
        
        ws.onmessage = (event) => {
            try {
                console.log("Received message:", event.data);
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };
        
        ws.onclose = (event) => {
            clearTimeout(connectionTimeout);
            console.log("WebSocket closed:", event.code, event.reason);
            updateConnectionStatus('disconnected');
            showMessage('Disconnected from server', 'error');
            
            // Clear any pending message on disconnect
            pendingMessage = null;
            
            // Reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
            clearTimeout(connectionTimeout);
            console.log("WebSocket error:", error);
            updateConnectionStatus('disconnected');
            showMessage('Connection error', 'error');
            console.error('WebSocket error:', error);
        };
        
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        updateConnectionStatus('disconnected');
        showMessage('Failed to connect', 'error');
        setTimeout(connectWebSocket, 3000);
    }
}

// Update connection status indicator
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        statusEl.className = `connection-status ${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
}

// Message handling - server-driven architecture
function handleServerMessage(message) {
    console.log('Received:', message);
    
    const handlers = {
        room_joined: (msg) => {
            const playerNameEl = document.getElementById('playerName');
            if (!playerNameEl) return;
            
            currentPlayer = { id: msg.playerId, name: playerNameEl.value };
            currentRoom = msg.roomId;
            isCreator = msg.isCreator;
            
            const roomIdEl = document.getElementById('currentRoomId');
            if (roomIdEl) roomIdEl.textContent = msg.roomId;
            
            updateLobbyPlayers(msg.players);
            showScreen('lobbyScreen');
            
            if (isCreator) {
                const settingsEl = document.getElementById('gameSettings');
                const startBtnEl = document.getElementById('startGameBtn');
                if (settingsEl) settingsEl.classList.remove('hidden');
                if (startBtnEl) startBtnEl.classList.remove('hidden');
            }
        },
        
        player_joined: (msg) => {
            showMessage(`${msg.player.name} joined the game`, 'info');
            updateLobbyPlayers(msg.players);
        },
        
        player_left: (msg) => {
            showMessage(`${msg.playerName} left the game`, 'info');
            updateLobbyPlayers(msg.players);
        },
        
        game_summary: (msg) => {
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
            showMessage('Game started!', 'success');
            showScreen('gameScreen');
            gameState = null;
        },
        
        prompt: (msg) => {
            displayPrompt(msg.prompt);
            resetWordInput();
        },
        
        round_ended: (msg) => {
            clearGameTimer();
        },
        
        game_finished: (msg) => {
            clearGameTimer();
            displayFinalResults(msg);
        },
        
        room_reset: () => {
            showMessage('Room reset - ready for new game', 'info');
            showScreen('lobbyScreen');
            gameState = null;
        },
        
        settings_updated: (msg) => updateSettingsDisplay(msg.settings),
        
        error: (msg) => showMessage(msg.message, 'error')
    };

    if (handlers[message.type]) {
        handlers[message.type](message);
    }
}

// Smart message sending with connection handling
const sendMessage = (message) => {
    console.log('Sending message:', message);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(message));
            console.log('Message sent successfully');
        } catch (error) {
            console.error('Error sending message:', error);
            showMessage('Error sending message', 'error');
        }
    } else {
        console.log('WebSocket not ready, queuing message');
        pendingMessage = message;
        
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            console.log('Connecting to send message...');
            connectWebSocket();
        } else {
            showMessage('Connecting to server...', 'info');
        }
    }
};

function sendWordUpdate(word) {
    sendMessage({
        type: 'word_update',
        word: word
    });
}

function updateGameDisplay(gameState) {
    console.log(gameState); 
    if (!gameState || !currentPlayer) return;
    
    const isMyTurn = gameState.turn === currentPlayer.id;
    const turnIndicator = document.getElementById('turnIndicator');
    const turnText = document.getElementById('turnText');
    
    if (turnIndicator && turnText) {
        turnIndicator.classList.remove('hidden');
        if (isMyTurn) {
            turnText.textContent = "It's your turn!";
            turnIndicator.style.background = 'linear-gradient(135deg, #28a745, #20c997)';
        } else {
            const currentPlayerName = gameState.players.find(p => p.id === gameState.turn)?.name || 'Someone';
            turnText.textContent = `⏳ ${currentPlayerName}'s turn...`;
            turnIndicator.style.background = 'linear-gradient(135deg, #6c757d, #5a6268)';
        }
    }
    
    const gamePlayersEl = document.getElementById('gamePlayers');
    if (gamePlayersEl && gameState.players) {
        gamePlayersEl.innerHTML = gameState.players.map(player => `
            <div class="player-card ${player.id === currentPlayer.id ? 'you' : ''} ${gameState.turn === player.id ? 'current-turn' : ''}">
                <div class="player-name">
                    ${player.name}${player.id === currentPlayer.id ? ' (You)' : ''}
                </div>
                <div class="player-lives">${player.lives || 0} lives</div>
                <div class="player-word">${player.word || '...'}</div>
                <span class="status-indicator ${gameState.turn === player.id ? 'your-turn' : 'waiting'}"></span>
            </div>
        `).join('');
    }
    
    const wordInput = document.getElementById('wordInput');
    const submitBtn = document.getElementById('submitBtn');
    
    if (wordInput && submitBtn) {
        const shouldEnableInput = isMyTurn;
        wordInput.disabled = !shouldEnableInput;
        submitBtn.disabled = !shouldEnableInput;
        
        if (shouldEnableInput && wordInput !== document.activeElement) {
            setTimeout(() => wordInput.focus(), 100);
        }
        
        if (!shouldEnableInput && wordInput.value.trim()) {
            wordInput.value = '';
            lastSentWord = '';
        }
    }
    
    if (gameState.timeRemaining !== undefined) {
        updateTimerDisplay(gameState.timeRemaining);
    }
    
    if (gameState.prompt) {
        displayPrompt(gameState.prompt);
    }
}

function displayPrompt(prompt) {
    const gamePromptEl = document.getElementById('gamePrompt');
    if (gamePromptEl && prompt) {
        gamePromptEl.textContent = prompt;
    }
}

function resetWordInput() {
    const wordInput = document.getElementById('wordInput');
    if (wordInput) {
        wordInput.value = '';
        lastSentWord = '';
        wordInput.disabled = true;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = true;
    }
}

function updateTimerDisplay(timeRemaining) {
    const timerEl = document.getElementById('gameTimer');
    if (timerEl && timeRemaining !== undefined) {
        const seconds = Math.ceil(timeRemaining / 100) / 10;
        timerEl.textContent = Math.max(0, seconds);
        
        if (seconds <= 5 && seconds > 0) {
            timerEl.style.color = '#dc3545';
            timerEl.style.fontWeight = 'bold';
        } else {
            timerEl.style.color = '';
            timerEl.style.fontWeight = '';
        }
    }
}

function clearGameTimer() {
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
}

async function createRoom() {
    const playerNameEl = document.getElementById('playerName');
    if (!playerNameEl) return;
    
    const playerName = playerNameEl.value.trim();
    if (!playerName) return showMessage('Please enter your name', 'error');
    
    // Read current values from form elements (with defaults)
    const maxPlayersEl = document.getElementById('maxPlayers');
    const turnTimeLimitEl = document.getElementById('turnTimeLimit');
    
    const message = {
        type: 'create_room',
        playerName: playerName,
        settings: {
            maxPlayers: maxPlayersEl ? parseInt(maxPlayersEl.value) || 8 : 8,
            turnTimeLimit: turnTimeLimitEl ? (parseInt(turnTimeLimitEl.value) || 30) * 1000 : 30000
        }
    };
    
    // Use smart sending - will connect if needed
    sendMessage(message);
}

function joinRoom() {
    const playerNameEl = document.getElementById('playerName');
    const roomIdEl = document.getElementById('roomIdInput');
    if (!playerNameEl || !roomIdEl) return;
    
    const playerName = playerNameEl.value.trim();
    const roomId = roomIdEl.value.trim().toUpperCase();
    
    if (!playerName) return showMessage('Please enter your name', 'error');
    if (!roomId) return showMessage('Please enter room code', 'error');
    
    const message = {
        type: 'join_room',
        roomId: roomId,
        playerName: playerName,
    };
    
    // Use smart sending - will connect if needed
    sendMessage(message);
}

function leaveRoom() {
    if (ws) ws.close();
    currentPlayer = null;
    currentRoom = null;
    isCreator = false;
    gameState = null;
    clearGameTimer();
    showScreen('homeScreen');
}

function startGame() {
    sendMessage({ type: 'start_game' });
}

function submitWord() {
    const wordInput = document.getElementById('wordInput');
    if (!wordInput || wordInput.disabled) return;
    
    const word = wordInput.value.trim();
    if (!word) {
        showMessage('Please enter a word', 'error');
        return;
    }
    
    if (!gameState || gameState.turn !== currentPlayer.id) {
        showMessage('It\'s not your turn!', 'error');
        return;
    }
    
    sendMessage({
        type: 'submit_word',
        word: word
    });
    
    wordInput.disabled = true;
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.disabled = true;
}

function updateSettings() {
    const maxPlayersEl = document.getElementById('maxPlayers');
    const turnTimeLimitEl = document.getElementById('turnTimeLimit');
    
    if (!maxPlayersEl || !turnTimeLimitEl) return;
    
    const settings = {
        maxPlayers: parseInt(maxPlayersEl.value),
        turnTimeLimit: parseInt(turnTimeLimitEl.value) * 1000
    };
    sendMessage({ type: 'update_settings', settings });
}

function updateSettingsDisplay(settings) {
    const maxPlayersEl = document.getElementById('maxPlayers');
    const turnTimeLimitEl = document.getElementById('turnTimeLimit');
    
    if (maxPlayersEl) maxPlayersEl.value = settings.maxPlayers;
    if (turnTimeLimitEl) turnTimeLimitEl.value = settings.turnTimeLimit / 1000;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function updateLobbyPlayers(players) {
    const lobbyPlayersEl = document.getElementById('lobbyPlayers');
    if (!lobbyPlayersEl || !players) return;
    
    lobbyPlayersEl.innerHTML = players.map(player => `
        <div class="player-card ${player.id === currentPlayer?.id ? 'you' : ''}">
            <div class="player-name">${player.name}${player.id === currentPlayer?.id ? ' (You)' : ''}</div>
            <div class="player-lives">Ready</div>
        </div>
    `).join('');
}

function displayFinalResults(results) {
    showScreen('finalResultsScreen');
    
    if (results.finalLeaderboard) {
        updateLeaderboard(results.finalLeaderboard, 'finalLeaderboard');
        
        const winner = results.finalLeaderboard[0];
        if (winner && winner.id === currentPlayer?.id) {
            showMessage('🎉 Congratulations! You won!', 'success');
        }
    }
}

function updateLeaderboard(leaderboard, containerId) {
    const container = document.getElementById(containerId);
    if (!container || !leaderboard) return;
    
    container.innerHTML = leaderboard.map((player, index) => `
        <div class="player-card ${player.id === currentPlayer?.id ? 'you' : ''}">
            <div class="player-name">
                ${index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`} 
                ${player.name}${player.id === currentPlayer?.id ? ' (You)' : ''}
            </div>
            <div class="player-lives">${player.lives} points</div>
        </div>
    `).join('');
}

function backToLobby() {
    sendMessage({ type: 'back_to_lobby' });
}

function backToHome() {
    leaveRoom();
}

function showMessage(text, type = 'info') {
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) return;
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    messageContainer.appendChild(message);
    
    setTimeout(() => {
        if (message.parentNode) {
            message.remove();
        }
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    const enterKeyHandler = (inputId, action) => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    action();
                }
            });
        }
    };
    
    enterKeyHandler('playerName', createRoom);
    enterKeyHandler('roomIdInput', joinRoom);
    enterKeyHandler('wordInput', submitWord);
    
    const roomIdInput = document.getElementById('roomIdInput');
    if (roomIdInput) {
        roomIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    const wordInput = document.getElementById('wordInput');
    if (wordInput) {
        wordInput.addEventListener('input', (e) => {
            const currentWord = e.target.value.trim();
            if (currentWord !== lastSentWord && !wordInput.disabled && 
                gameState && gameState.turn === currentPlayer.id) {
                sendWordUpdate(currentWord);
                lastSentWord = currentWord;
            }
        });
    }
    
    const playerNameInput = document.getElementById('playerName');
    if (playerNameInput) {
        playerNameInput.focus();
    }
});

window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});

window.addEventListener('load', () => {
    updateConnectionStatus('disconnected');
});