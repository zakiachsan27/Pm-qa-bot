const axios = require('axios');

/**
 * AI Service - Supports multiple providers (Claude/Kimi/OpenAI)
 * Can switch provider via environment variable
 */
class AIService {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'kimi'; // 'claude', 'kimi', 'openai'
    this.apiKey = process.env.AI_API_KEY || '';
    
    // Provider configs
    this.configs = {
      kimi: {
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'kimi-for-coding',
        headers: {
          'User-Agent': 'KimiCLI/0.77'
        }
      },
      openai: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      claude: {
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-3-haiku-20240307',
      }
    };
  }

  /**
   * Get current provider config
   */
  getConfig() {
    return this.configs[this.provider] || this.configs.kimi;
  }

  /**
   * Chat completion - works with Kimi/OpenAI (same format)
   */
  async chat(messages, systemPrompt = '') {
    const config = this.getConfig();
    
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    try {
      if (this.provider === 'claude') {
        return await this.chatClaude(allMessages, systemPrompt);
      }
      
      // Kimi and OpenAI use same format
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(config.headers || {})
      };
      
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: config.model,
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 4000,
        },
        {
          headers,
          timeout: 180000, // 3 minutes for reasoning models
        }
      );

      // Handle Kimi reasoning model - content might be in reasoning_content
      const choice = response.data.choices[0].message;
      // Prefer content, fallback to reasoning_content (for reasoning models)
      let result = choice.content;
      if (!result || result.trim() === '') {
        result = choice.reasoning_content;
      }
      // If reasoning_content is too long (raw thinking), just use a summary
      if (result && result.length > 2000) {
        result = result.substring(0, 2000) + '...\n\n_[Respons dipotong]_';
      }
      return result || 'Maaf, tidak bisa generate respons.';
    } catch (error) {
      console.error(`AI Error (${this.provider}):`, error.response?.data || error.message);
      throw new Error(`AI request failed: ${error.message}`);
    }
  }

  /**
   * Claude-specific chat (different API format)
   */
  async chatClaude(messages, systemPrompt) {
    const config = this.getConfig();
    
    // Claude uses different format
    const claudeMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const response = await axios.post(
      `${config.baseUrl}/messages`,
      {
        model: config.model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: claudeMessages,
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data.content[0].text;
  }

  /**
   * Simple question answering with context
   */
  async answer(question, context) {
    const systemPrompt = `Kamu adalah asisten PM Bot untuk tim Bapenda Jakarta.

DATA TASK:
${context}

ATURAN KETAT:
1. HANYA jawab yang ditanyakan - JANGAN tambah info lain
2. Jika ditanya modul X, HANYA tampilkan task di modul X
3. Jangan mention modul lain yang tidak ditanyakan
4. Format WhatsApp: *bold*, _italic_
5. Jawab singkat dan fokus
6. Jika tidak ada data, bilang "Tidak ada task di modul tersebut"`;

    const messages = [
      { role: 'user', content: question }
    ];

    return await this.chat(messages, systemPrompt);
  }
}

module.exports = AIService;
