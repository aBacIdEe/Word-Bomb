class GameState {
    constructor() {
      this.currentPrompt = null;
      this.currentRound = 0;
      this.maxRounds = 10;
      this.players = new Map(); // playerId -> player game data
      this.submissions = new Map(); // playerId -> current round submission
      this.roundStartTime = null;
      this.roundEndTime = null;
      this.gamePhase = 'waiting'; // 'waiting', 'active', 'finished'
      this.usedPrompts = new Set();
    }
  
    initializePlayer(playerId, playerName) {
      this.players.set(playerId, {
        id: playerId,
        name: playerName,
        score: 0,
        correctAnswers: 0,
        submissions: [] // history of all submissions
      });
    }
  
    removePlayer(playerId) {
      this.players.delete(playerId);
      this.submissions.delete(playerId);
    }
  
    startNewRound(prompt) {
      this.currentRound++;
      this.currentPrompt = prompt;
      this.submissions.clear();
      this.roundStartTime = Date.now();
      this.roundEndTime = null;
      this.usedPrompts.add(prompt.criteria);
    }
  
    submitAnswer(playerId, word) {
      if (this.submissions.has(playerId)) {
        return false; // Already submitted this round
      }
      
      this.submissions.set(playerId, {
        word: word.toLowerCase().trim(),
        timestamp: Date.now(),
        isValid: this.validateAnswer(word)
      });
      
      return true;
    }
  
    validateAnswer(word) {
      if (!this.currentPrompt) return false;
      
      const cleanWord = word.toLowerCase().trim();
      return this.currentPrompt.answers.includes(cleanWord);
    }
  
    endRound() {
      this.roundEndTime = Date.now();
      
      // Calculate scores for this round
      this.submissions.forEach((submission, playerId) => {
        const player = this.players.get(playerId);
        if (player && submission.isValid) {
          player.score += 1;
          player.correctAnswers += 1;
        }
        
        // Add to submission history
        if (player) {
          player.submissions.push({
            round: this.currentRound,
            criteria: this.currentPrompt.criteria,
            word: submission.word,
            isValid: submission.isValid,
            timestamp: submission.timestamp
          });
        }
      });
    }
  
    isGameFinished() {
      return this.currentRound >= this.maxRounds;
    }
  
    getLeaderboard() {
      return Array.from(this.players.values())
        .sort((a, b) => b.score - a.score)
        .map((player, index) => ({
          rank: index + 1,
          ...player
        }));
    }
  
    getRoundResults() {
      const results = new Map();
      
      this.submissions.forEach((submission, playerId) => {
        const player = this.players.get(playerId);
        results.set(playerId, {
          playerName: player.name,
          word: submission.word,
          isValid: submission.isValid,
          points: submission.isValid ? 1 : 0
        });
      });
      
      return results;
    }
  }
  
  module.exports = GameState;