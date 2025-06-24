class GameRoom {
  constructor(id, wordList = [], settings = this.getDefaultSettings()) {
    this.id = id; // Unique identifier for the room
    this.creator = null; // Player ID of the creator of the room
    this.players = new Map(); // Map of playerId to player object { lives, word, ws, order, name }
    this.settings = settings; // Default settings for the game room
    this.status = 'waiting'; // 'waiting', 'active', 'finished'
    this.createdAt = new Date(); // Timestamp when the room was created
    this.currentTurn = null; // player ID of the player whose turn it is
    this.turnTimer = null; // Timer for the current turn
    this.turnStartTime = null; // Timestamp when the current turn started
    this.currentRound = 0; // Current round number

    this.guessedWords = [] // Array to keep track of words guessed in the game
    this.wordList = wordList; // List of words available for the game

    setInterval(() => {
      // update players every 100 ms during active game
      if (this.status === 'active') {
        this.broadcastGameSummary();
      }
    }, 50);
  }

  getDefaultSettings() {
    return {
      maxPlayers: 5,
      turnTimeLimit: 10000, // 10 seconds per round
    };
  }

  // Helper function to calculate remaining time
  getRemainingTime() {
    if (!this.turnStartTime || this.status !== 'active') {
      return 0;
    }
    
    const elapsed = Date.now() - this.turnStartTime;
    const remaining = Math.max(0, this.settings.turnTimeLimit - elapsed);
    return remaining;
  }

  // Helper function to get players array for messages
  getPlayersArray() {
    return Array.from(this.players.entries()).map(([playerId, player]) => ({
      id: playerId,
      name: player.name || playerId,
      lives: player.lives,
      word: player.word
    }));
  }

  // Helper function to broadcast message to all players in room
  broadcastToRoom(message) {
    this.players.forEach((player, playerId) => {
      if (player.ws && player.ws.readyState === player.ws.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    });
  }

  // Send message to specific player
  sendToPlayer(playerId, message) {
    const player = this.players.get(playerId);
    if (player && player.ws && player.ws.readyState === player.ws.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }

  // Message sending methods
  sendRoomJoined(playerId) {
    const message = {
      type: 'room_joined',
      roomId: this.id,
      playerId: playerId,
      players: this.getPlayersArray(),
      isCreator: playerId === this.creator
    };
    this.sendToPlayer(playerId, message);
  }

  broadcastPlayerJoined(newPlayerId) {
    const newPlayer = this.players.get(newPlayerId);
    const message = {
      type: 'player_joined',
      player: {
        id: newPlayerId,
        name: newPlayer.name || newPlayerId,
        lives: newPlayer.lives
      },
      players: this.getPlayersArray()
    };
    // Send to all players except the one who just joined
    this.players.forEach((player, playerId) => {
      if (playerId !== newPlayerId && player.ws && player.ws.readyState === player.ws.OPEN) {
        player.ws.send(JSON.stringify(message));
      }
    });
  }

  broadcastPlayerLeft(leftPlayerId, playerName) {
    const message = {
      type: 'player_left',
      playerName: playerName,
      players: this.getPlayersArray()
    };
    this.broadcastToRoom(message);
  }

  broadcastGameSummary() {
    const message = {
      type: 'game_summary',
      status: this.status,
      turn: this.currentTurn,
      timeRemaining: this.getRemainingTime(),
      players: this.getPlayersArray()
    };
    this.broadcastToRoom(message);
  }

  broadcastGameStarted() {
    const message = {
      type: 'game_started'
    };
    this.broadcastToRoom(message);
  }

  broadcastPrompt(prompt) {
    const message = {
      type: 'prompt',
      prompt: prompt
    };
    this.broadcastToRoom(message);
  }

  broadcastRoundEnded(roundResults = {}) {
    const message = {
      type: 'round_ended',
      roundResults: {
        ...roundResults,
        currentRound: this.currentRound,
        players: this.getPlayersArray()
      }
    };
    this.broadcastToRoom(message);
  }

  broadcastGameFinished() {
    // Determine the winner based on lives
    const winner = Array.from(this.players.values()).find(player => player.lives > 0);
    const message = {
      type: 'game_finished',
      winner: winner ? {
        id: winner.id,
        name: winner.name || winner.id,
        lives: winner.lives
      } : null,
      finalLives: this.getPlayersArray().sort((a, b) => b.lives - a.lives)
    };
    this.broadcastToRoom(message);
  }

  broadcastRoomReset() {
    const message = {
      type: 'room_reset'
    };
    this.broadcastToRoom(message);
  }

  broadcastSettingsUpdated() {
    const message = {
      type: 'settings_updated',
      settings: this.settings
    };
    this.broadcastToRoom(message);
  }

  sendError(playerId, errorMessage) {
    const message = {
      type: 'error',
      message: errorMessage
    };
    this.sendToPlayer(playerId, message);
  }

  // Modified game methods to include messaging
  addPlayer(playerId, ws, playerName = null) {
    if (this.players.size >= this.settings.maxPlayers) {
      this.sendError(playerId, 'Room is full');
      return { success: false, error: 'Room is full' };
    }
    
    if (this.players.has(playerId)) {
      this.sendError(playerId, 'Player already in room');
      return { success: false, error: 'Player already in room' };
    }
    
    this.players.set(playerId, { 
      lives: 3, 
      word: "", 
      ws: ws, 
      name: playerName || playerId 
    });
    
    if (!this.creator) {
      this.creator = playerId; // First player becomes the creator
    }
    
    // Send confirmation to joining player
    this.sendRoomJoined(playerId);
    
    // Notify other players
    this.broadcastPlayerJoined(playerId);
    
    return { success: true, playerId };
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) {
      return { success: false, error: 'Player not in room' };
    }
    
    const player = this.players.get(playerId);
    const playerName = player.name || playerId;
    
    this.players.delete(playerId);
    
    // Notify remaining players
    this.broadcastPlayerLeft(playerId, playerName);
    
    // If creator left, assign new creator
    if (this.creator === playerId && this.players.size > 0) {
      this.creator = this.players.keys().next().value;
    }
    
    return { success: true };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.broadcastSettingsUpdated();
    return { success: true };
  }

  startGame() {
    if (this.status !== 'waiting') {
      return { success: false, error: 'Game already started' };
    }
    
    this.status = 'active';
    
    // Assign order randomly
    const playerArray = Array.from(this.players.keys());
    playerArray.sort(() => Math.random() - 0.5);
    playerArray.forEach((playerId, index) => {
      this.players.get(playerId).order = index;
    });
    
    // Notify players game started
    this.broadcastGameStarted();
    
    // Start first round
    this.startNewRound();
    
    return { success: true };
  }

  async startNewRound() {
    const playerArray = Array.from(this.players.keys());
    this.currentRound++;
    while (playerArray[this.currentRound % playerArray.length].lives <= 0) {
        this.currentRound++;
    }
    this.currentTurn = playerArray[this.currentRound % playerArray.length];
    
    // Record when the turn started
    this.turnStartTime = Date.now();
    
    // Set turn timer
    this.turnTimer = setTimeout(() => {
      this.endRound();
    }, this.settings.turnTimeLimit);
    
    // Send prompt to all players
    const prompt = this.getPrompt();
    this.broadcastPrompt(prompt);
    
    return prompt;
  }

  getPrompt() {
    // get a random word from the word list that's not in guessedWords and return a substring of length three of it
    const availableWords = this.wordList.filter(word => !this.guessedWords.includes(word.toLowerCase()));
    if (availableWords.length === 0) {
      return 'No more words available';
    }
    const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
    return randomWord.substring(0, 3); // Return first 3 characters as prompt
  }

  // Handles Player interaction
  submitWord(playerId) {
    if (playerId !== this.currentTurn) {
      this.sendError(playerId, 'Not your turn');
      return { success: false, error: 'Not your turn' };
    }

    if (!this.players.has(playerId)) {
      this.sendError(playerId, 'Player not in room');
      return { success: false, error: 'Player not in room' };
    }

    const player = this.players.get(playerId);
    const word = player.word.trim();
    
    const valid = !this.guessedWords.includes(word.toLowerCase()) && this.wordList.includes(word.toLowerCase());
    if (!valid) {
      this.sendError(playerId, 'Invalid word or already guessed');
      return { success: false, error: 'Invalid word or already guessed' };
    }
    
    this.guessedWords.push(word.toLowerCase());
    this.endRound({ submittedWord: word, playerId: playerId });
    return { success: true };
  }

  // Handles after time is up or player submits a word
  endRound(roundResults = {}) {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
      
      // Lose life for not submitting a word
      if (!roundResults.submittedWord) {
        this.players.get(this.currentTurn).lives -= 1;
      }
    }
    
    // // Broadcast round ended
    // this.broadcastRoundEnded(roundResults);
    
    // end game if only one player left with lives
    const alivePlayers = Array.from(this.players.values()).filter(player => player.lives > 0);
    if (alivePlayers.length <= 1) {
      this.endGame();
      return;
    }
    
    // Start next round if game isn't over
    setTimeout(() => {
      this.startNewRound();
    }, 100); // .1 second delay between rounds
  }

  // Handles the end of the game
  endGame() {
    this.status = 'finished';
    
    // Clean up any timers
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    
    this.turnStartTime = null;
    
    // Broadcast game finished
    this.broadcastGameFinished();
  }

  // Reset room for new game
  resetRoom() {
    this.status = 'waiting';
    this.currentTurn = null;
    this.turnStartTime = null;
    this.currentRound = 0;
    this.guessedWords = [];
    
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    
    // Reset player lives
    this.players.forEach((player) => {
      player.lives = 3;
      player.word = "";
    });
    
    this.broadcastRoomReset();
    
    return { success: true };
  }

  getGameSummary() {
    return {
      status: this.status,
      turn: this.currentTurn,
      timeRemaining: this.getRemainingTime(),
      players: this.getPlayersArray(),
    };
  }
}

module.exports = GameRoom;