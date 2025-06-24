const GameRoom = require('./gameRoom');
const { generateRoomId } = require('../utils/idGenerator');
const fs = require('fs');
const path = require('path');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.wordlist = null;
    this.wordlistLoaded = false;
  }

  // Load word list once at startup
  async loadWordList() {
    if (this.wordlistLoaded) {
      return this.wordlist;
    }

    console.log('Loading word list...');
    const startTime = Date.now();

    try {
      const wordlistPath = path.join(__dirname, '../assets/wordlist.txt');
      const wordlistContent = await fs.promises.readFile(wordlistPath, 'utf8');
      
      this.wordlist = wordlistContent
        .split('\n')
        .map(word => word.trim())
        .filter(word => word.length > 0);
      
      this.wordlistLoaded = true;
      const loadTime = Date.now() - startTime;
      console.log(`✅ Loaded ${this.wordlist.length} words in ${loadTime}ms`);
      
      return this.wordlist;
    } catch (error) {
      console.error('❌ Error loading word list:', error);
      throw error;
    }
  }

  // Synchronous version for backward compatibility (throws if not loaded)
  getWordList() {
    if (!this.wordlistLoaded) {
      throw new Error('Word list not loaded. Call loadWordList() first.');
    }
    return this.wordlist;
  }

  createRoom(settings) {
    const roomId = generateRoomId();
    
    // Use cached wordlist instead of reading file
    const wordlist = this.getWordList();
    
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