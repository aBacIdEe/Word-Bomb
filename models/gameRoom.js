// models/GameRoom.js (updated sections)
const GameState = require('./gameState');
const WordGameLogic = require('../services/WordGameLogic');

class GameRoom {
  constructor(id, settings = {}) {
    this.id = id;
    this.creator = null;
    this.players = new Map();
    this.gameState = new GameState();
    this.settings = { ...this.getDefaultSettings(), ...settings };
    this.status = 'waiting';
    this.createdAt = new Date();
    this.currentTurn = null;
    this.turnTimer = null;
    
    // Word game specific
    this.wordGameLogic = new WordGameLogic('./data/criteria.json');
  }

  getDefaultSettings() {
    return {
      maxPlayers: 8,
      turnTimeLimit: 30000, // 30 seconds per round
      maxRounds: 10,
      difficulty: null // null = random, 'easy', 'medium', 'hard'
    };
  }

  startGame() {
    if (this.players.size < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    this.status = 'in-progress';
    this.gameState.gamePhase = 'active';
    this.gameState.maxRounds = this.settings.maxRounds;
    
    // Initialize all players in game state
    this.players.forEach((player, playerId) => {
      this.gameState.initializePlayer(playerId, player.name);
    });
    
    this.startNewRound();
    return { success: true };
  }

  startNewRound() {
    const prompt = this.wordGameLogic.getRandomPrompt(
      this.gameState.usedPrompts,
      this.settings.difficulty
    );
    
    this.gameState.startNewRound(prompt);
    
    // Set turn timer
    this.turnTimer = setTimeout(() => {
      this.endRound();
    }, this.settings.turnTimeLimit);
    
    return prompt;
  }

  submitWord(playerId, word) {
    if (this.gameState.gamePhase !== 'active') {
      return { success: false, error: 'Game not active' };
    }
    
    if (!this.players.has(playerId)) {
      return { success: false, error: 'Player not in room' };
    }
    
    const submitted = this.gameState.submitAnswer(playerId, word);
    if (!submitted) {
      return { success: false, error: 'Already submitted this round' };
    }
    
    // Check if all players have submitted
    if (this.gameState.submissions.size === this.players.size) {
      this.endRound();
    }
    
    return { success: true };
  }

  endRound() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    
    this.gameState.endRound();
    const results = this.gameState.getRoundResults();
    
    if (this.gameState.isGameFinished()) {
      this.endGame();
    }
    
    return results;
  }

  endGame() {
    this.status = 'finished';
    this.gameState.gamePhase = 'finished';
    
    // Clean up any timers
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  getGameSummary() {
    return {
      status: this.status,
      currentRound: this.gameState.currentRound,
      maxRounds: this.gameState.maxRounds,
      currentPrompt: this.gameState.currentPrompt,
      players: Array.from(this.gameState.players.values()),
      leaderboard: this.gameState.getLeaderboard(),
      timeRemaining: this.getRemainingTime()
    };
  }

  getRemainingTime() {
    if (!this.gameState.roundStartTime || this.gameState.roundEndTime) {
      return 0;
    }
    
    const elapsed = Date.now() - this.gameState.roundStartTime;
    const remaining = Math.max(0, this.settings.turnTimeLimit - elapsed);
    return remaining;
  }
}

module.exports = GameRoom;