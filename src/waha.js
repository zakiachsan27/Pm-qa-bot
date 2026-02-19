const axios = require('axios');

class WahaService {
  constructor() {
    this.baseUrl = process.env.WAHA_API_URL || 'http://localhost:3001';
    this.apiKey = process.env.WAHA_API_KEY || 'bapenda2026';
    this.session = process.env.WAHA_SESSION || 'default';
  }

  get headers() {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async getGroups() {
    const response = await axios.get(
      `${this.baseUrl}/api/${this.session}/groups`,
      { headers: this.headers }
    );
    return response.data;
  }

  async findGroupByName(name) {
    const groups = await this.getGroups();
    return groups.find(g => 
      g.name?.toLowerCase().includes(name.toLowerCase())
    );
  }

  async startTyping(chatId) {
    try {
      await axios.post(
        `${this.baseUrl}/api/startTyping`,
        {
          session: this.session,
          chatId,
        },
        { headers: this.headers }
      );
    } catch (err) {
      console.log('Typing indicator not supported or failed:', err.message);
    }
  }

  async stopTyping(chatId) {
    try {
      await axios.post(
        `${this.baseUrl}/api/stopTyping`,
        {
          session: this.session,
          chatId,
        },
        { headers: this.headers }
      );
    } catch (err) {
      // Ignore errors
    }
  }

  async sendMessage(chatId, text) {
    const response = await axios.post(
      `${this.baseUrl}/api/sendText`,
      {
        session: this.session,
        chatId,
        text,
      },
      { headers: this.headers }
    );
    return response.data;
  }

  async sendMessageWithTyping(chatId, text, typingDuration = 4000) {
    // Start typing indicator
    await this.startTyping(chatId);
    
    // Wait to simulate typing (random 3-5 seconds)
    const duration = typingDuration + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Stop typing and send message
    await this.stopTyping(chatId);
    return this.sendMessage(chatId, text);
  }

  async getStatus() {
    const response = await axios.get(
      `${this.baseUrl}/api/sessions/${this.session}`,
      { headers: this.headers }
    );
    return response.data;
  }

  async getMe() {
    const response = await axios.get(
      `${this.baseUrl}/api/sessions/${this.session}/me`,
      { headers: this.headers }
    );
    return response.data;
  }

  async sendTyping(chatId, isTyping = true) {
    try {
      if (isTyping) {
        await this.startTyping(chatId);
      } else {
        await this.stopTyping(chatId);
      }
    } catch (err) {
      // Ignore typing errors
    }
  }
}

module.exports = WahaService;
