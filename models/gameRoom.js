class GameRoom {
  constructor(id, ws, wordList = [], settings = this.getDefaultSettings()) {
    this.id = id;
    this.ws = ws;
    this.creator = null;
    this.players = new Map();
    this.settings = settings;
    this.status = 'waiting';
    this.createdAt = new Date();
    this.currentTurn = null;
    this.turnTimer = null;

    this.guessedWords = []
    this.wordList = wordList;
  }

  getDefaultSettings() {
    return {
      maxPlayers: 8,
      turnTimeLimit: 30000, // 30 seconds per round
    };
  }

  addPlayer(playerId) {
    if (this.players.size >= this.settings.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }
    
    if (this.players.has(playerId)) {
      return { success: false, error: 'Player already in room' };
    }
    
    this.players.set(playerId, { id: playerId, score: 0 });
    
    if (!this.creator) {
      this.creator = playerId; // First player becomes the creator
    }
    
    return { success: true, playerId };
  }

  removePlayer(playerId) {
    if (!this.players.has(playerId)) {
        return { success: false, error: 'Player not in room' };
    }
    this.players.delete(playerId);
  }

  startGame() {
    this.status = 'active';
    this.startNewRound();
    return { success: true };
  }

  startNewRound() {
    const prompt = this.wordGameLogic.getPrompt();
    
    this.ws.send(JSON.stringify({
        type: 'prompt',
        prompt: prompt,
        }));
    
    // Set turn timer
    this.turnTimer = setTimeout(() => {
      this.endRound();
    }, this.settings.turnTimeLimit);
    
    return prompt;
  }

  getPrompt() {
    // chooses a random word
  }

  // Handles Player interaction
  submitWord(playerId, word) {
    if (!this.players.has(playerId)) {
      return { success: false, error: 'Player not in room' };
    }
    
    const valid = !this.guessedWords.has(word.toLowerCase()) && this.wordList.includes(word.toLowerCase());
    if (!valid) {
      return { success: false, error: 'Already submitted this round' };
    }
    
    this.guessedWords.push(word.toLowerCase());
    this.endRound();
    return { success: true };
  }

  // Handles after time is up or player submits a word
  endRound() {
    if (this.turnTimer > 0) {
      this.players.get(this.currentTurn).score += 1; // Increment score for the current player
    }
    return;
  }

  // Handles the end of the game
  endGame() {
    this.status = 'finished';
    
    // Clean up any timers
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  getGameSummary() {
    return {
      status: this.status,
      timeRemaining: this.getRemainingTime()
    };
  }

  getRemainingTime() {
    return this.settings.turnTimeLimit - this.turnTimer;
  }
}

module.exports = GameRoom;