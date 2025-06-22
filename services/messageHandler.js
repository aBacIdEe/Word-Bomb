// services/MessageHandler.js
const { generatePlayerId } = require('../utils/idGenerator');

class MessageHandler {
  constructor(roomManager) {
    this.roomManager = roomManager;
  }

  handleConnection(ws, req) {
    console.log('New WebSocket connection');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(ws, message);
      } catch (error) {
        this.sendError(ws, 'Invalid JSON message');
      }
    });
    
    ws.on('close', () => {
      this.handlePlayerDisconnect(ws);
    });
  }

  handleMessage(ws, message) {
    console.log('Received message:', message.type);
    
    switch (message.type) {
      case 'join_room':
        this.handleJoinRoom(ws, message);
        break;
        
      case 'start_game':
        this.handleStartGame(ws, message);
        break;
        
      case 'submit_word':
        this.handleSubmitWord(ws, message);
        break;
        
      case 'update_settings':
        this.handleUpdateSettings(ws, message);
        break;
        
      case 'get_game_state':
        this.handleGetGameState(ws, message);
        break;
        
      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  handleJoinRoom(ws, message) {
    const { roomId, playerName } = message;
    
    if (!roomId || !playerName) {
      return this.sendError(ws, 'Room ID and player name required');
    }
    
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      return this.sendError(ws, 'Room not found');
    }
    
    if (room.players.size >= room.settings.maxPlayers) {
      return this.sendError(ws, 'Room is full');
    }
    
    if (room.status === 'in-progress') {
      return this.sendError(ws, 'Game already in progress');
    }
    
    const playerId = generatePlayerId();
    const player = room.addPlayer(playerId, playerName, ws);
    
    // Store player connection info
    this.roomManager.playerConnections.set(ws, { playerId, roomId });
    
    // Send join confirmation to new player
    ws.send(JSON.stringify({
      type: 'room_joined',
      roomId: roomId,
      playerId: playerId,
      isCreator: room.creator === playerId,
      gameState: room.getGameSummary(),
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name
      }))
    }));
    
    // Broadcast to all other players
    this.broadcastToRoom(room, {
      type: 'player_joined',
      player: { id: playerId, name: playerName },
      playerCount: room.players.size
    }, ws); // Exclude the new player from broadcast
    
    console.log(`Player ${playerName} joined room ${roomId}`);
  }

  handleStartGame(ws, message) {
    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, 'Not connected to a room');
    }
    
    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, 'Room not found');
    }
    
    // Only room creator can start the game
    if (room.creator !== playerInfo.playerId) {
      return this.sendError(ws, 'Only room creator can start the game');
    }
    
    const result = room.startGame();
    if (!result.success) {
      return this.sendError(ws, result.error);
    }
    
    // Broadcast game start to all players
    this.broadcastToRoom(room, {
      type: 'game_started',
      gameState: room.getGameSummary()
    });
    
    // Start first round
    this.startRound(room);
    
    console.log(`Game started in room ${room.id}`);
  }

  handleSubmitWord(ws, message) {
    const { word } = message;
    
    if (!word || typeof word !== 'string') {
      return this.sendError(ws, 'Valid word required');
    }
    
    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, 'Not connected to a room');
    }
    
    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, 'Room not found');
    }
    
    const result = room.submitWord(playerInfo.playerId, word);
    if (!result.success) {
      return this.sendError(ws, result.error);
    }
    
    const player = room.players.get(playerInfo.playerId);
    
    // Send confirmation to submitting player
    ws.send(JSON.stringify({
      type: 'word_submitted',
      word: word,
      submissionCount: room.gameState.submissions.size,
      totalPlayers: room.players.size
    }));
    
    // Broadcast that player submitted (without revealing the word yet)
    this.broadcastToRoom(room, {
      type: 'player_submitted',
      playerName: player.name,
      submissionCount: room.gameState.submissions.size,
      totalPlayers: room.players.size
    }, ws);
    
    // Check if round should end (all players submitted)
    if (room.gameState.submissions.size === room.players.size) {
      setTimeout(() => this.endRound(room), 1000); // Small delay for dramatic effect
    }
    
    console.log(`Player ${player.name} submitted word: ${word}`);
  }

  handleUpdateSettings(ws, message) {
    const { settings } = message;
    
    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, 'Not connected to a room');
    }
    
    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, 'Room not found');
    }
    
    // Only room creator can update settings
    if (room.creator !== playerInfo.playerId) {
      return this.sendError(ws, 'Only room creator can update settings');
    }
    
    if (room.status !== 'waiting') {
      return this.sendError(ws, 'Cannot update settings during game');
    }
    
    // Update settings (with validation)
    if (settings.maxPlayers && settings.maxPlayers >= 2 && settings.maxPlayers <= 20) {
      room.settings.maxPlayers = settings.maxPlayers;
    }
    
    if (settings.turnTimeLimit && settings.turnTimeLimit >= 10000 && settings.turnTimeLimit <= 120000) {
      room.settings.turnTimeLimit = settings.turnTimeLimit;
    }
    
    if (settings.maxRounds && settings.maxRounds >= 1 && settings.maxRounds <= 50) {
      room.settings.maxRounds = settings.maxRounds;
    }
    
    if (settings.difficulty && ['easy', 'medium', 'hard'].includes(settings.difficulty)) {
      room.settings.difficulty = settings.difficulty;
    }
    
    // Broadcast updated settings
    this.broadcastToRoom(room, {
      type: 'settings_updated',
      settings: room.settings
    });
    
    console.log(`Settings updated for room ${room.id}`);
  }

  handleGetGameState(ws, message) {
    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, 'Not connected to a room');
    }
    
    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, 'Room not found');
    }
    
    ws.send(JSON.stringify({
      type: 'game_state',
      gameState: room.getGameSummary()
    }));
  }

  startRound(room) {
    const prompt = room.gameState.currentPrompt;
    
    this.broadcastToRoom(room, {
      type: 'round_started',
      round: room.gameState.currentRound,
      totalRounds: room.gameState.maxRounds,
      prompt: prompt.criteria,
      timeLimit: room.settings.turnTimeLimit,
      difficulty: prompt.difficulty
    });
    
    console.log(`Round ${room.gameState.currentRound} started in room ${room.id}: "${prompt.criteria}"`);
  }

  endRound(room) {
    const results = room.endRound();
    
    // Prepare results for broadcast
    const roundResults = Array.from(results.entries()).map(([playerId, result]) => ({
      playerId,
      playerName: result.playerName,
      word: result.word,
      isValid: result.isValid,
      points: result.points
    }));
    
    this.broadcastToRoom(room, {
      type: 'round_ended',
      round: room.gameState.currentRound,
      results: roundResults,
      leaderboard: room.gameState.getLeaderboard(),
      correctAnswers: room.gameState.currentPrompt.answers.slice(0, 5) // Show some correct answers
    });
    
    console.log(`Round ${room.gameState.currentRound} ended in room ${room.id}`);
    
    // Check if game is finished
    if (room.gameState.isGameFinished()) {
      setTimeout(() => this.endGame(room), 3000); // 3 second delay to show results
    } else {
      // Start next round after delay
      setTimeout(() => {
        room.startNewRound();
        this.startRound(room);
      }, 5000); // 5 second delay between rounds
    }
  }

  endGame(room) {
    room.endGame();
    
    this.broadcastToRoom(room, {
      type: 'game_finished',
      finalLeaderboard: room.gameState.getLeaderboard(),
      gameStats: {
        totalRounds: room.gameState.currentRound,
        totalPlayers: room.players.size
      }
    });
    
    console.log(`Game finished in room ${room.id}`);
    
    // Reset room status after delay to allow for new game
    setTimeout(() => {
      room.status = 'waiting';
      room.gameState = new (require('../models/gameState'))();
      
      this.broadcastToRoom(room, {
        type: 'room_reset',
        message: 'Room is ready for a new game'
      });
    }, 10000); // 10 seconds to view final results
  }

  handlePlayerDisconnect(ws) {
    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) return;
    
    const { playerId, roomId } = playerInfo;
    const room = this.roomManager.getRoom(roomId);
    
    if (room) {
      const player = room.players.get(playerId);
      const playerName = player ? player.name : 'Unknown';
      
      room.removePlayer(playerId);
      this.roomManager.playerConnections.delete(ws);
      
      // If game was in progress and no players left, end it
      if (room.players.size === 0) {
        this.roomManager.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted - no players remaining`);
        return;
      }
      
      // Broadcast player disconnect
      this.broadcastToRoom(room, {
        type: 'player_left',
        playerName: playerName,
        playerCount: room.players.size
      });
      
      // If game was in progress, check if we need to end the round early
      if (room.status === 'in-progress' && room.gameState.gamePhase === 'active') {
        if (room.gameState.submissions.size === room.players.size) {
          // All remaining players have submitted, end round
          this.endRound(room);
        }
      }
      
      console.log(`Player ${playerName} disconnected from room ${roomId}`);
    }
  }

  broadcastToRoom(room, message, excludeWs = null) {
    const messageStr = JSON.stringify(message);
    
    room.players.forEach(player => {
      if (player.ws !== excludeWs && player.ws.readyState === 1) { // WebSocket.OPEN = 1
        player.ws.send(messageStr);
      }
    });
  }

  sendError(ws, errorMessage) {
    ws.send(JSON.stringify({
      type: 'error',
      message: errorMessage
    }));
  }
}

module.exports = MessageHandler;