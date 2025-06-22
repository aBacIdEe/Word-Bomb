const GameRoom = require('./gameRoom');
const { generateRoomId } = require('../utils/idGenerator');
const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(settings) {
    const roomId = generateRoomId();
   
    // Read and parse the word list
    const wordlistPath = path.join(__dirname, '../assets/wordlist.txt');
    const wordlistContent = fs.readFileSync(wordlistPath, 'utf8');
    const wordlist = wordlistContent.split('\n').map(word => word.trim()).filter(word => word.length > 0);
   
    // Create room with wordlist as second parameter, settings as third
    const room = new GameRoom(roomId, wordlist, settings);
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