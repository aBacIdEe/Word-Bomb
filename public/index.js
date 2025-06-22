const CONFIG = {
    API_BASE_URL: 'http://localhost:3000',
    WS_URL: 'ws://localhost:3000'
};

let ws = null;
let currentPlayer = null;
let currentRoom = null;
let isCreator = false;
let gameState = null;
let gameTimer = null;
let lastSentWord = '';

// WebSocket connection with status indicator
async function connectWebSocket() {
    console.log('Connecting to:', CONFIG.WS_URL);
    updateConnectionStatus('connecting');
    
    try {
        ws = new WebSocket(CONFIG.WS_URL);
        
        ws.onopen = () => {
            updateConnectionStatus('connected');
            showMessage('Connected to server', 'success');
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleServerMessage(message);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };
        
        ws.onclose = () => {
            updateConnectionStatus('disconnected');
            showMessage('Disconnected from server', 'error');
            setTimeout(connectWebSocket, 3000);
        };
        
        ws.onerror = (error) => {
            updateConnectionStatus('disconnected');
            showMessage('Connection error', 'error');
            console.error('WebSocket error:', error);
        };
    } catch (error) {
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
        
        // Modified: round_ended now just shows a brief message and continues
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

// Utility functions
const sendMessage = (message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        showMessage('Not connected to server', 'error');
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
            turnText.textContent = "🎯 Your turn! Type a word quickly!";
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
                    ${gameState.turn === player.id ? ' 🎯' : ''}
                </div>
                <div class="player-score">${player.score || 0} points</div>
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
    
    const playerCountEl = document.getElementById('playerCount');
    if (playerCountEl && gameState.players) {
        playerCountEl.textContent = gameState.players.length;
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
    
    await connectWebSocket();
    setTimeout(() => sendMessage({
        type: 'create_room',
        playerName: playerName,
    }), 100);
}

function joinRoom() {
    const playerNameEl = document.getElementById('playerName');
    const roomIdEl = document.getElementById('roomIdInput');
    if (!playerNameEl || !roomIdEl) return;
    
    const playerName = playerNameEl.value.trim();
    const roomId = roomIdEl.value.trim().toUpperCase();
    
    if (!playerName) return showMessage('Please enter your name', 'error');
    if (!roomId) return showMessage('Please enter room code', 'error');
    
    connectWebSocket();
    setTimeout(() => sendMessage({
        type: 'join_room',
        roomId: roomId,
        playerName: playerName,
    }), 100);
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
            <div class="player-score">Ready</div>
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
            <div class="player-score">${player.score} points</div>
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