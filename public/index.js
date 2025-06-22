const CONFIG = {
    // Change this to match your backend server port
    API_BASE_URL: 'http://localhost:3000',
    WS_URL: 'ws://localhost:3000'
};

// Game state
let ws = null;
let currentPlayer = null;
let currentRoom = null;
let gameState = null;
let isCreator = false;
let gameTimer = null;

// WebSocket connection
async function connectWebSocket() {
    console.log('Connecting to:', CONFIG.WS_URL);
    ws = new WebSocket(CONFIG.WS_URL);
    
    ws.onopen = () => showMessage('Connected to server', 'success');
    ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
    ws.onclose = () => {
        showMessage('Disconnected from server', 'error');
        setTimeout(connectWebSocket, 3000);
    };
    ws.onerror = () => showMessage('Connection error', 'error');
}

// Message handling
function handleServerMessage(message) {
    console.log('Received:', message);
    
    const handlers = {
        room_joined: (msg) => {
            const playerNameEl = safeGet('playerName');
            if (!playerNameEl) return;
            
            currentPlayer = { id: msg.playerId, name: playerNameEl.value };
            currentRoom = msg.roomId;
            isCreator = msg.isCreator;
            
            const roomIdEl = safeGet('currentRoomId');
            if (roomIdEl) roomIdEl.textContent = msg.roomId;
            
            updateLobbyPlayers(msg.players);
            showScreen('lobbyScreen');
            
            if (isCreator) {
                const settingsEl = safeGet('gameSettings');
                const startBtnEl = safeGet('startGameBtn');
                if (settingsEl) settingsEl.classList.remove('hidden');
                if (startBtnEl) startBtnEl.classList.remove('hidden');
            }
        },
        player_joined: (msg) => {
            showMessage(`${msg.player.name} joined the game`, 'info');
            addPlayerToLobby(msg.player);
        },
        player_left: (msg) => showMessage(`${msg.playerName} left the game`, 'info'),
        game_started: (msg) => {
            gameState = msg.gameState;
            showMessage('Game started!', 'success');
        },
        round_started: startRound,
        word_submitted: onWordSubmitted,
        player_submitted: onPlayerSubmitted,
        round_ended: showRoundResults,
        game_finished: showFinalResults,
        room_reset: () => {
            showMessage('Room reset - ready for new game', 'info');
            showScreen('lobbyScreen');
        },
        settings_updated: (msg) => updateSettingsDisplay(msg.settings),
        error: (msg) => showMessage(msg.message, 'error')
    };

    if (handlers[message.type]) {
        handlers[message.type](message);
    }
}

// Utility functions
const $ = (id) => document.getElementById(id);
const safeGet = (id) => {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element with id '${id}' not found`);
    return el;
};
const sendMessage = (message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const stringifiedMessage = JSON.stringify(message);
        console.log('Sending message to server:', stringifiedMessage);
        const parsedMessage = JSON.parse(stringifiedMessage);
        console.log('Parsed message:', parsedMessage);

        ws.send(stringifiedMessage);
    } else {
        showMessage('Not connected to server', 'error');
    }
};

// Room management
async function createRoom() {
    const playerNameEl = safeGet('playerName');
    if (!playerNameEl) return;
    
    const playerName = playerNameEl.value.trim();
    if (!playerName) return showMessage('Please enter your name', 'error');
    
    await connectWebSocket();
    console.log('Creating room with player name:', playerName);
    setTimeout(() => sendMessage({
        type: 'create_room',
        playerName: playerName,
    }), 100);
}

function joinRoom() {
    const playerNameEl = safeGet('playerName');
    const roomIdEl = safeGet('roomIdInput');
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

function joinSpecificRoom(roomId) {
    const playerNameEl = safeGet('playerName');
    const roomIdEl = safeGet('roomIdInput');
    if (!playerNameEl || !roomIdEl) return;
    
    const playerName = playerNameEl.value.trim();
    if (!playerName) return showMessage('Please enter your name first', 'error');
    
    roomIdEl.value = roomId;
    joinRoom();
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

// Game functions
function startGame() {
    sendMessage({ type: 'start_game' });
}

function startRound(message) {
    showScreen('gameScreen');
    
    const currentRoundEl = safeGet('currentRound');
    const totalRoundsEl = safeGet('totalRounds');
    const gamePromptEl = safeGet('gamePrompt');
    const promptDifficultyEl = safeGet('promptDifficulty');
    
    if (currentRoundEl) currentRoundEl.textContent = message.round;
    if (totalRoundsEl) totalRoundsEl.textContent = message.totalRounds;
    if (gamePromptEl) gamePromptEl.textContent = message.prompt;
    if (promptDifficultyEl) promptDifficultyEl.textContent = message.difficulty.toUpperCase();
    
    const wordInput = safeGet('wordInput');
    const submitBtn = safeGet('submitBtn');
    const submissionStatus = safeGet('submissionStatus');
    const wordInputSection = safeGet('wordInputSection');
    
    if (wordInput) {
        wordInput.value = '';
        wordInput.disabled = false;
        wordInput.focus();
    }
    if (submitBtn) submitBtn.disabled = false;
    if (submissionStatus) submissionStatus.classList.add('hidden');
    if (wordInputSection) wordInputSection.classList.remove('hidden');
    
    startGameTimer(message.timeLimit);
}

function submitWord() {
    const wordInput = safeGet('wordInput');
    if (!wordInput) return;
    
    const word = wordInput.value.trim();
    if (!word) return showMessage('Please enter a word', 'error');
    
    sendMessage({ type: 'submit_word', word: word });
}

function onWordSubmitted(message) {
    const wordInput = safeGet('wordInput');
    const submitBtn = safeGet('submitBtn');
    const wordInputSection = safeGet('wordInputSection');
    const submissionStatus = safeGet('submissionStatus');
    const submissionCount = safeGet('submissionCount');
    const totalPlayers = safeGet('totalPlayers');
    
    if (wordInput) wordInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    if (wordInputSection) wordInputSection.classList.add('hidden');
    if (submissionStatus) submissionStatus.classList.remove('hidden');
    if (submissionCount) submissionCount.textContent = message.submissionCount;
    if (totalPlayers) totalPlayers.textContent = message.totalPlayers;
}

function onPlayerSubmitted(message) {
    const submissionCount = safeGet('submissionCount');
    if (submissionCount) submissionCount.textContent = message.submissionCount;
    updatePlayerSubmissionStatus(message.playerName, true);
}

function showRoundResults(message) {
    clearGameTimer();
    showScreen('resultsScreen');
    
    const resultsRound = safeGet('resultsRound');
    const resultsTableBody = safeGet('resultsTableBody');
    const correctAnswerTags = safeGet('correctAnswerTags');
    
    if (resultsRound) resultsRound.textContent = message.round;
    
    if (resultsTableBody) {
        resultsTableBody.innerHTML = message.results.map(result => `
            <tr>
                <td>${result.playerName}</td>
                <td class="word-result ${result.isValid ? 'valid' : 'invalid'}">${result.word}</td>
                <td>${result.isValid ? '✅' : '❌'}</td>
                <td>${result.points}</td>
            </tr>
        `).join('');
    }
    
    if (correctAnswerTags) {
        correctAnswerTags.innerHTML = message.correctAnswers.map(answer => 
            `<span class="answer-tag">${answer}</span>`
        ).join('');
    }
    
    updateLeaderboard(message.leaderboard, 'leaderboard');
}

function showFinalResults(message) {
    clearGameTimer();
    showScreen('finalResultsScreen');
    updateLeaderboard(message.finalLeaderboard, 'finalLeaderboard');
    
    const winner = message.finalLeaderboard[0];
    if (winner && winner.id === currentPlayer.id) {
        showMessage('🎉 Congratulations! You won!', 'success');
    }
}

function backToLobby() { showScreen('lobbyScreen'); }
function backToHome() { leaveRoom(); }

// Settings
function updateSettings() {
    const maxPlayersEl = safeGet('maxPlayers');
    const turnTimeLimitEl = safeGet('turnTimeLimit');
    const maxRoundsEl = safeGet('maxRounds');
    const difficultyEl = safeGet('difficulty');
    
    if (!maxPlayersEl || !turnTimeLimitEl || !maxRoundsEl || !difficultyEl) return;
    
    const settings = {
        maxPlayers: parseInt(maxPlayersEl.value),
        turnTimeLimit: parseInt(turnTimeLimitEl.value),
        maxRounds: parseInt(maxRoundsEl.value),
        difficulty: difficultyEl.value || null
    };
    sendMessage({ type: 'update_settings', settings });
}

function updateSettingsDisplay(settings) {
    const maxPlayersEl = safeGet('maxPlayers');
    const turnTimeLimitEl = safeGet('turnTimeLimit');
    const maxRoundsEl = safeGet('maxRounds');
    const difficultyEl = safeGet('difficulty');
    
    if (maxPlayersEl) maxPlayersEl.value = settings.maxPlayers;
    if (turnTimeLimitEl) turnTimeLimitEl.value = settings.turnTimeLimit;
    if (maxRoundsEl) maxRoundsEl.value = settings.maxRounds;
    if (difficultyEl) difficultyEl.value = settings.difficulty || '';
}

// Timer
function startGameTimer(duration) {
    clearGameTimer();
    let timeLeft = Math.floor(duration / 1000);
    const timerElement = safeGet('gameTimer');
    if (!timerElement) return;
    
    const updateTimer = () => {
        timerElement.textContent = timeLeft;
        timerElement.classList.toggle('warning', timeLeft <= 10);
        if (timeLeft <= 0) return clearGameTimer();
        timeLeft--;
    };
    
    updateTimer();
    gameTimer = setInterval(updateTimer, 1000);
}

function clearGameTimer() {
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
}

// UI helpers
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    const targetScreen = safeGet(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function updateLobbyPlayers(players) {
    const lobbyPlayersEl = safeGet('lobbyPlayers');
    if (!lobbyPlayersEl) return;
    
    lobbyPlayersEl.innerHTML = players.map(player => `
        <div class="player-card ${player.id === currentPlayer.id ? 'you' : ''}">
            <div class="player-name">${player.name}${player.id === currentPlayer.id ? ' (You)' : ''}</div>
            <div class="player-score">Ready</div>
        </div>
    `).join('');
}

function addPlayerToLobby(player) {
    const container = safeGet('lobbyPlayers');
    if (!container) return;
    
    container.innerHTML += `
        <div class="player-card">
            <div class="player-name">${player.name}</div>
            <div class="player-score">Ready</div>
        </div>
    `;
}

function updatePlayerSubmissionStatus(playerName, submitted) {
    const playerCards = document.querySelectorAll('#gamePlayers .player-card');
    playerCards.forEach(card => {
        const nameElement = card.querySelector('.player-name');
        if (nameElement && nameElement.textContent.includes(playerName)) {
            card.classList.toggle('submitted', submitted);
            const checkmark = card.querySelector('.checkmark');
            if (submitted && !checkmark) {
                card.insertAdjacentHTML('beforeend', '<div class="checkmark">✓</div>');
            } else if (!submitted && checkmark) {
                checkmark.remove();
            }
        }
    });
}

function updateLeaderboard(leaderboard, containerId) {
    const container = safeGet(containerId);
    if (!container) return;
    
    container.innerHTML = leaderboard.map((player, index) => `
        <div class="player-card ${player.id === currentPlayer.id ? 'you' : ''}">
            <div class="player-name">
                ${index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`} 
                ${player.name}${player.id === currentPlayer.id ? ' (You)' : ''}
            </div>
            <div class="player-score">${player.score} points</div>
        </div>
    `).join('');
}

function showMessage(text, type = 'info') {
    const messageContainer = safeGet('messageContainer');
    if (!messageContainer) return;
    
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    messageContainer.appendChild(message);
    setTimeout(() => message.remove(), 5000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const enterKeyHandler = (inputId, action) => {
        const input = safeGet(inputId);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') action();
            });
        }
    };
    
    enterKeyHandler('playerName', createRoom);
    enterKeyHandler('roomIdInput', joinRoom);
    enterKeyHandler('wordInput', submitWord);
    
    const roomIdInput = safeGet('roomIdInput');
    if (roomIdInput) {
        roomIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    const playerNameInput = safeGet('playerName');
    if (playerNameInput) playerNameInput.focus();
});

window.addEventListener('beforeunload', () => {
    if (ws) ws.close();
});