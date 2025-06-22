const express = require('express');
const router = express.Router();

// This will be injected by server.js
let roomManager;

function setRoomManager(manager) {
  roomManager = manager;
}

router.get('/games', (req, res) => {
  const activeGames = roomManager.getActiveRooms();
  res.json(activeGames);
});

router.post('/games', (req, res) => {
  const room = roomManager.createRoom(req.body.settings);
  res.json({ 
    roomId: room.id, 
    url: `/room/${room.id}` 
  });
});

router.get('/games/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.getPublicInfo());
});

module.exports = { router, setRoomManager };