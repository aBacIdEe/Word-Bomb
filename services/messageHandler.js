const { generatePlayerId } = require("../utils/idGenerator");

// Handles all WebSocket messages for the game server
class MessageHandler {
  constructor(roomManager) {
    this.roomManager = roomManager;
  }

  handleConnection(ws, req) {
    console.log("New WebSocket connection");

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("Parsed message:", message);
        this.handleMessage(ws, message);
      } catch (error) {
        console.log(error);
        this.sendError(ws, "Invalid JSON message");
      }
    });

    ws.on("close", () => {
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

      case "update_settings":
        this.handleUpdateSettings(ws, message);
        break;

      case "get_game_state":
        this.handleGetGameState(ws, message);
        break;

      default:
        this.sendError(ws, "Unknown message type");
    }
  }

  handleCreateRoom(ws, message) {
    const { settings } = message;

    // Create new room
    const roomId = this.roomManager.createRoom(ws, settings);
    // Store player connection info
    const playerId = generatePlayerId();
    this.roomManager.playerConnections.set(ws, { playerId, roomId });
    // Send room created confirmation
    ws.send(
      JSON.stringify({
        type: "room_created",
        roomId: roomId,
        playerId: playerId,
        isCreator: true,
        gameState: this.roomManager.getRoom(roomId).getGameSummary(),
        players: [playerId],
      })
    );
    console.log(`Room ${roomId} created by player ${playerId}`);
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

    if (room.players.size >= room.settings.maxPlayers) {
      return this.sendError(ws, "Room is full");
    }

    if (room.status === "active") {
      return this.sendError(ws, "Game already in progress");
    }

    const playerId = generatePlayerId();
    const player = room.addPlayer(playerId, playerName, ws);

    // Send join confirmation to new player
    ws.send(
      JSON.stringify({
        type: "room_joined",
        roomId: roomId,
        playerId: playerId,
        isCreator: room.creator === playerId,
        gameState: room.getGameSummary(),
        players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
        })),
      })
    );

    console.log(`Player ${playerName} joined room ${roomId}`);
  }

  handleStartGame(ws, message) {
    const playerInfo = this.roomManager.playerConnections.get(ws);
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
      gameState: room.getGameSummary(),
    });

    // Start first round
    this.startRound(room);

    console.log(`Game started in room ${room.id}`);
  }

  handleSubmitWord(ws, message) {
    const { word } = message;

    if (!word || typeof word !== "string") {
      return this.sendError(ws, "Valid word required");
    }

    const playerInfo = this.roomManager.playerConnections.get(ws);
    if (!playerInfo) {
      return this.sendError(ws, "Not connected to a room");
    }

    const room = this.roomManager.getRoom(playerInfo.roomId);
    if (!room) {
      return this.sendError(ws, "Room not found");
    }

    const result = room.submitWord(playerInfo.playerId, word);
    if (!result.success) {
      return this.sendError(ws, result.error);
    }

    const player = room.players.get(playerInfo.playerId);

    // Send confirmation to submitting player
    ws.send(
      JSON.stringify({
        type: "word_submitted",
        word: word,
        totalPlayers: room.players.size,
      })
    );

    // Broadcast that player submitted (without revealing the word yet)
    this.broadcastToRoom(
      room,
      {
        type: "player_submitted",
        playerName: player.name,
        totalPlayers: room.players.size,
      },
      ws
    );

    console.log(`Player ${player.name} submitted word: ${word}`);
  }

  handleUpdateSettings(ws, message) {
    const { settings } = message;

    const playerInfo = this.roomManager.playerConnections.get(ws);
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

    // Update settings (with validation)
    if (
      settings.maxPlayers &&
      settings.maxPlayers >= 2 &&
      settings.maxPlayers <= 20
    ) {
      room.settings.maxPlayers = settings.maxPlayers;
    }

    if (
      settings.turnTimeLimit &&
      settings.turnTimeLimit >= 10000 &&
      settings.turnTimeLimit <= 120000
    ) {
      room.settings.turnTimeLimit = settings.turnTimeLimit;
    }

    console.log(`Settings updated for room ${room.id}`);
  }

  broadcastToRoom(room, message, excludeWs = null) {
    const messageStr = JSON.stringify(message);

    room.players.forEach((player) => {
      if (player.ws !== excludeWs && player.ws.readyState === 1) {
        // WebSocket.OPEN = 1
        player.ws.send(messageStr);
      }
    });
  }

  sendError(ws, errorMessage) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: errorMessage,
      })
    );
  }
}

module.exports = MessageHandler;
