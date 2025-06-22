const GameRoom = require('../models/gameRoom');
const { generateRoomId } = require('../utils/idGenerator');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(settings) {
    const roomId = generateRoomId();
    const room = new GameRoom(roomId, settings);
    this.rooms.set(roomId, room);
    return roomId;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }

  getActiveRooms() {
    return this.getAllRooms()
      .filter(room => !room.settings.private)
      .map(room => room.getPublicInfo());
  }
}

module.exports = RoomManager;