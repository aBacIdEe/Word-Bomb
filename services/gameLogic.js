const fs = require('fs');
const path = require('path');

class GameLogic {
  constructor(criteriaFilePath) {
    this.criteriaData = this.loadCriteriaData(criteriaFilePath);
    this.availablePrompts = this.processCriteriaData();
  }

  loadCriteriaData(filePath) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load criteria data:', error);
      throw new Error('Could not load word game data');
    }
  }

  processCriteriaData() {
    // Convert your JSON structure into prompt objects
    const prompts = [];
    
    Object.entries(this.criteriaData).forEach(([criteria, answers]) => {
      prompts.push({
        criteria: criteria,
        answers: Array.isArray(answers) ? answers.map(a => a.toLowerCase()) : [answers.toLowerCase()],
        difficulty: this.calculateDifficulty(answers)
      });
    });
    
    return prompts;
  }

  calculateDifficulty(answers) {
    // Simple difficulty based on number of possible answers
    const count = Array.isArray(answers) ? answers.length : 1;
    if (count < 5) return 'hard';
    if (count < 15) return 'medium';
    return 'easy';
  }

  getRandomPrompt(usedPrompts = new Set(), difficulty = null) {
    let availablePrompts = this.availablePrompts.filter(
      prompt => !usedPrompts.has(prompt.criteria)
    );
    
    if (difficulty) {
      availablePrompts = availablePrompts.filter(
        prompt => prompt.difficulty === difficulty
      );
    }
    
    if (availablePrompts.length === 0) {
      // If no unused prompts, reset and allow reuse
      availablePrompts = this.availablePrompts;
    }
    
    const randomIndex = Math.floor(Math.random() * availablePrompts.length);
    return availablePrompts[randomIndex];
  }

  validateWord(word, criteria) {
    const prompt = this.availablePrompts.find(p => p.criteria === criteria);
    if (!prompt) return false;
    
    const cleanWord = word.toLowerCase().trim();
    return prompt.answers.includes(cleanWord);
  }

  getHint(criteria, excludeAnswers = []) {
    const prompt = this.availablePrompts.find(p => p.criteria === criteria);
    if (!prompt) return null;
    
    const availableAnswers = prompt.answers.filter(
      answer => !excludeAnswers.includes(answer)
    );
    
    if (availableAnswers.length === 0) return null;
    
    // Return a random valid answer as a hint
    const randomIndex = Math.floor(Math.random() * availableAnswers.length);
    return availableAnswers[randomIndex];
  }

  getStats() {
    return {
      totalPrompts: this.availablePrompts.length,
      difficulties: {
        easy: this.availablePrompts.filter(p => p.difficulty === 'easy').length,
        medium: this.availablePrompts.filter(p => p.difficulty === 'medium').length,
        hard: this.availablePrompts.filter(p => p.difficulty === 'hard').length
      }
    };
  }
}

module.exports = WordGameLogic;