function generateRoomId() {
    const chars = 'BCDFGJMPQRSTYZ235789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
  
  function generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  }
  
  module.exports = {
    generateRoomId,
    generatePlayerId
  };