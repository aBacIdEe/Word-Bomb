const { generatePlayerId } = require("../utils/idGenerator");

// Handles all WebSocket messages for the game server
class MessageHandler {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.playerConnections = new Map(); // ws -> {playerId, roomId, playerName}
  }

  handleConnection(ws, req) {
    console.log("New WebSocket connection");

    console.log(req);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("Parsed message:", message);
        this.handleMessage(ws, message);
      } catch (error) {
        console.log("JSON parse error:", error);
        this.sendError(ws, "Invalid JSON message");
      }
    });

    ws.on("close", () => {
      this.handlePlayerDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.log("WebSocket error:", error);
      this.handlePlayerDisconnect(ws);
    });
  }

  handleMessage(ws, message) {
    console.log("Received message:", message.type);

    switch (message.type) {
      case "create_room":
        this.handleCreateRoom(ws, message);
        break;

      case "join_room":
        this.handleJoinRoom(ws, message);
        break;

      case "start_game":
        this.handleStartGame(ws, message);
        break;

      case "submit_word":
        this.handleSubmitWord(ws, message);
        break;

      case "word_update":
        this.handleWordUpdate(ws, message);
        break;

      case "update_settings":
        this.handleUpdateSettings(ws, message);
        break;

      case "continue_game":
        this.handleContinueGame(ws, message);
        break;

      case "back_to_lobby":
        this.handleBackToLobby(ws, message);
        break;

      default:
        this.sendError(ws, "Unknown message type");
    }
  }

  handleCreateRoom(ws, message) {
    console.log("Creating room with message:", message);
    const { playerName, settings } = message;

    if (!playerName || typeof playerName !== "string") {
      return this.sendError(ws, "Player name required");
    }

    // Create new room with default settings
    const roomId = this.roomManager.createRoom(settings);
    const room = this.roomManager.getRoom(roomId);
    
    if (!room) {
      return this.sendError(ws, "Failed to create room");
    }

    // Generate player ID and add to room
    const playerId = generatePlayerId();
    const addResult = room.addPlayer(playerId, ws);
    
    if (!addResult.success) {
      return this.sendError(ws, addResult.error);
    }

    // Store connection info
    this.playerConnections.set(ws, {
      playerId: playerId,
      roomId: roomId,
      playerName: playerName
    });

    // Set player name in room
    const player = room.players.get(playerId);
    if (player) {
      player.name = playerName;
    }

    // Send room joined confirmation
    ws.send(JSON.stringify({
      type: "room_joined",
      roomId: roomId,
      playerId: playerId,
      isCreator: true,
      players: Array.from(room.players.values()).map(p => ({
        id: playerId,
        name: playerName
      }))
    }));

    console.log(`Room ${roomId} created by player ${playerName} (${playerId})`);
  }

  handleJoinRoom(ws, message) {
    const { roomId, playerName } = message;

    if (!roomId || !playerName) {
      return this.sendError(ws, "Room ID and player name required");
    }

    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    if (room.status === "active") {
      return this.sendError(ws, "Game already in progress");
    }

    const playerId = generatePlayerId();
    const addResult = room.addPlayer(playerId, ws);

    if (!addResult.success) {
      return this.sendError(ws, addResult.error);
    }

    // Store connection info
    this.playerConnections.set(ws, {
      playerId: playerId,
      roomId: roomId,
      playerName: playerName
    });

    // Set player name in room
    const player = room.players.get(playerId);
    if (player) {
      player.name = playerName;
    }

    // Get all players for response
    const allPlayers = Array.from(room.players.values()).map((p, index) => {
      const connectionInfo = Array.from(this.playerConnections.values())
        .find(conn => conn.playerId === (Array.from(room.players.keys())[index]));
      return {
        id: Array.from(room.players.keys())[index],
        name: connectionInfo ? connectionInfo.playerName : `Player ${index + 1}`
      };
    });

    // Send join confirmation to new player
    ws.send(JSON.stringify({
      type: "room_joined",
      roomId: roomId,
      playerId: playerId,
      isCreator: room.creator === playerId,
      players: allPlayers
    }));

    // Broadcast to other players that someone joined
    this.broadcastToRoom(room, {
      type: "player_joined",
      player: { id: playerId, name: playerName },
      players: allPlayers
    }, ws);

    console.log(`Player ${playerName} (${playerId}) joined room ${roomId}`);
  }

  handleStartGame(ws, message) {
    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    // Only room creator can start the game
    if (room.creator !== playerInfo.playerId) {
      return this.sendError(ws, "Only room creator can start the game");
    }

    const result = room.startGame();
    if (!result.success) {
      return this.sendError(ws, result.error);
    }

    // Broadcast game start to all players
    this.broadcastToRoom(room, {
      type: "game_started",
      gameState: room.getGameSummary()
    });

    console.log(`Game started in room ${room.id}`);
  }

  handleSubmitWord(ws, message) {
    const { word } = message;

    if (!word || typeof word !== "string") {
      return this.sendError(ws, "Valid word required");
    }

    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    // Check if it's this player's turn
    if (room.currentTurn !== playerInfo.playerId) {
      return this.sendError(ws, "Not your turn");
    }

    // Set the player's word and submit
    const player = room.players.get(playerInfo.playerId);
    if (player) {
      player.word = word;
    }

    const result = room.submitWord(playerInfo.playerId);
    if (!result.success) {
      return this.sendError(ws, result.error);
    }

    console.log(`Player ${playerInfo.playerName} submitted word: ${word}`);
  }

  handleWordUpdate(ws, message) {
    const { word } = message;

    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return; // Silently ignore if not connected
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room || room.status !== 'active') {
      return; // Silently ignore if room not found or not active
    }

    // Update player's current word (for real-time display)
    const player = room.players.get(playerInfo.playerId);
    if (player) {
      player.word = word || "";
    }

    // The regular game summary broadcast will send this update to all players
  }

  handleUpdateSettings(ws, message) {
    const { settings } = message;

    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    // Only room creator can update settings
    if (room.creator !== playerInfo.playerId) {
      return this.sendError(ws, "Only room creator can update settings");
    }

    if (room.status !== "waiting") {
      return this.sendError(ws, "Cannot update settings during game");
    }

    // Update settings with validation
    if (settings.maxPlayers && settings.maxPlayers >= 1 && settings.maxPlayers <= 20) {
      room.settings.maxPlayers = settings.maxPlayers;
    }

    if (settings.turnTimeLimit && settings.turnTimeLimit >= 1000 && settings.turnTimeLimit <= 120000) {
      room.settings.turnTimeLimit = settings.turnTimeLimit;
    }

    // Broadcast updated settings to all players
    this.broadcastToRoom(room, {
      type: "settings_updated",
      settings: settings
    });

    console.log(`Settings updated for room ${room.id}:`, settings);
  }

  handleContinueGame(ws, message) {
    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    // Continue to next round or end game
    if (room.status === 'finished') {
      // Game is over, can't continue
      return this.sendError(ws, "Game is finished");
    }

    // Start next round
    room.startNewRound();
  }

  handleBackToLobby(ws, message) {
    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    // Only creator can reset room
    if (room.creator !== playerInfo.playerId) {
      return this.sendError(ws, "Only room creator can reset the game");
    }

    // Reset room to waiting state with proper cleanup
    this.resetRoomToLobby(room);

    // Broadcast room reset
    this.broadcastToRoom(room, {
      type: "room_reset"
    });

    console.log(`Room ${room.id} reset to lobby`);
  }

  handlePlayerDisconnect(ws) {
    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) {
      return; // Player wasn't connected to a room
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (room) {
      // Remove player from room
      room.removePlayer(playerInfo.playerId);

      // Broadcast that player left
      this.broadcastToRoom(room, {
        type: "player_left",
        playerName: playerInfo.playerName,
        playerId: playerInfo.playerId
      });

      // If room is empty, clean up and delete
      if (room.players.size === 0) {
        this.cleanupAndDeleteRoom(room);
      } else if (room.creator === playerInfo.playerId) {
        // Transfer creator to another player
        const newCreator = Array.from(room.players.keys())[0];
        room.creator = newCreator;
        console.log(`Room ${room.id} creator transferred to ${newCreator}`);
      }

      console.log(`Player ${playerInfo.playerName} disconnected from room ${room.id}`);
    }

    // Remove from connections map
    this.playerConnections.delete(ws);
  }

  // NEW METHOD: Comprehensive room cleanup before deletion
  cleanupAndDeleteRoom(room) {
    console.log(`Starting cleanup for room ${room.id}`);
    
    // Clear all timers
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    
    if (room.gameTimer) {
      clearTimeout(room.gameTimer);
      room.gameTimer = null;
    }
    
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    
    // Clear any intervals
    if (room.updateInterval) {
      clearInterval(room.updateInterval);
      room.updateInterval = null;
    }
    
    if (room.heartbeatInterval) {
      clearInterval(room.heartbeatInterval);
      room.heartbeatInterval = null;
    }
    
    // Close all WebSocket connections in the room
    room.players.forEach((player, playerId) => {
      if (player.ws && player.ws.readyState === 1) { // WebSocket.OPEN
        try {
          player.ws.close(1000, 'Room deleted');
        } catch (error) {
          console.log(`Error closing WebSocket for player ${playerId}:`, error);
        }
      }
      // Null the WebSocket reference
      player.ws = null;
    });
    
    // Clear all room data
    room.players.clear();
    room.currentTurn = null;
    room.status = null;
    room.creator = null;
    room.settings = null;
    
    // Clear game-specific data
    if (room.guessedWords) {
      room.guessedWords.length = 0;
      room.guessedWords = null;
    }
    
    if (room.gameState) {
      room.gameState = null;
    }
    
    if (room.rounds) {
      room.rounds.length = 0;
      room.rounds = null;
    }
    
    // Remove all player connections related to this room
    for (const [ws, playerInfo] of this.playerConnections) {
      if (playerInfo.roomId === room.id) {
        this.playerConnections.delete(ws);
      }
    }
    
    // Finally delete the room from roomManager
    this.roomManager.rooms.delete(room.id);
    
    console.log(`Room ${room.id} completely cleaned up and deleted`);
  }

  // NEW METHOD: Reset room to lobby state with proper cleanup
  resetRoomToLobby(room) {
    // Clear all game-related timers
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }
    
    if (room.gameTimer) {
      clearTimeout(room.gameTimer);
      room.gameTimer = null;
    }
    
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    
    // Clear game intervals
    if (room.updateInterval) {
      clearInterval(room.updateInterval);
      room.updateInterval = null;
    }
    
    // Reset room state
    room.status = 'waiting';
    room.currentTurn = null;
    
    // Clear game data
    if (room.guessedWords) {
      room.guessedWords.length = 0;
    } else {
      room.guessedWords = [];
    }
    
    if (room.gameState) {
      room.gameState = null;
    }
    
    if (room.rounds) {
      room.rounds.length = 0;
    }
    
    // Reset all player scores and words
    room.players.forEach(player => {
      player.score = 0;
      player.word = "";
      player.ready = false; // Reset ready state if it exists
      player.hasSubmitted = false; // Reset submission state if it exists
    });
  }

  broadcastToRoom(room, message, excludeWs = null) {
    const messageStr = JSON.stringify(message);

    room.players.forEach((player) => {
      if (player.ws !== excludeWs && player.ws && player.ws.readyState === 1) {
        // WebSocket.OPEN = 1
        try {
          player.ws.send(messageStr);
        } catch (error) {
          console.log("Error sending message to player:", error);
          // If sending fails, consider the connection dead
          player.ws = null;
        }
      }
    });
  }

  sendError(ws, errorMessage) {
    if (ws && ws.readyState === 1) { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify({
          type: "error",
          message: errorMessage
        }));
      } catch (error) {
        console.log("Error sending error message:", error);
      }
    }
  }

  // Helper method to get player info from WebSocket
  getPlayerInfo(ws) {
    return this.playerConnections.get(ws);
  }

  // Helper method to get room by WebSocket
  getRoomByWs(ws) {
    const playerInfo = this.playerConnections.get(ws);
    if (!playerInfo) return null;
    return this.roomManager.getRoom(playerInfo.roomId);
  }

  // NEW METHOD: Force cleanup of stale rooms (can be called periodically)
  cleanupStaleRooms() {
    this.roomManager.rooms.forEach((room, roomId) => {
      let hasActiveConnections = false;
      
      room.players.forEach((player) => {
        if (player.ws && player.ws.readyState === 1) {
          hasActiveConnections = true;
        }
      });
      
      if (!hasActiveConnections) {
        console.log(`Found stale room ${roomId}, cleaning up...`);
        this.cleanupAndDeleteRoom(room);
      }
    });
  }
}

module.exports = MessageHandler;