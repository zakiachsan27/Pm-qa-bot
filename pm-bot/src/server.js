const express = require('express');
const SheetsService = require('./sheets');
const WahaService = require('./waha');

const app = express();
app.use(express.json());

const sheets = new SheetsService();
const waha = new WahaService();

// Config
const MENTION_NUMBER = process.env.MENTION_NUMBER || ''; // Zaki's number
const GROUP_IDS = (process.env.WA_GROUP_IDS || '').split(',').filter(id => id.trim());
const MIN_DELAY = parseInt(process.env.MIN_DELAY) || 10000; // 10 seconds
const MAX_DELAY = parseInt(process.env.MAX_DELAY) || 60000; // 60 seconds
const MAX_ITEMS_DIRECT = 10; // Show details directly if <= this number

// Random delay
function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY)) + MIN_DELAY;
}

// Task-related keywords to detect relevant questions
const TASK_KEYWORDS = [
  // Query types
  'detail', 'rincian', 'breakdown', 'info', 'informasi',
  'status', 'progress', 'update', 'perkembangan',
  'list', 'daftar', 'semua', 'all',
  'task', 'tugas', 'incident', 'tiket',
  'modul', 'module', 'aplikasi', 'app',
  // App names (partial)
  'coretax', 'pajak', 'eret', 'ros', 'bphtb', 'pbb', 'reklame',
  'sim pbb', 'helpdesk', 'website', 'bapenda', 'infotax',
  // Status names
  'on progress', 'ready to test', 'on testing', 'ready to deploy',
  'deployed', 'done', 'selesai',
];

// Check if message is task-related
function isTaskRelated(text) {
  const lower = text.toLowerCase();
  return TASK_KEYWORDS.some(keyword => lower.includes(keyword));
}

// Parse question from message
function parseQuestion(text) {
  // Remove mention
  let question = text.replace(/@\d+/g, '').trim();
  
  // Keywords
  const keywords = {
    detail: ['detail', 'rincian', 'breakdown', 'info'],
    status: ['status', 'progress', 'update'],
    list: ['list', 'daftar', 'semua'],
  };
  
  // Try to extract app/module name
  let app = null;
  let module = null;
  let queryType = 'general';
  
  // Check for app - module pattern
  const appModuleMatch = question.match(/(.+?)\s*[-–]\s*(.+)/i);
  if (appModuleMatch) {
    app = appModuleMatch[1].trim();
    module = appModuleMatch[2].trim();
  } else {
    // Just app name
    app = question.replace(/^(detail|info|status|list|daftar)\s*/i, '').trim();
  }
  
  // Determine query type
  for (const [type, words] of Object.entries(keywords)) {
    if (words.some(w => question.toLowerCase().includes(w))) {
      queryType = type;
      break;
    }
  }
  
  return { app, module, queryType, originalText: question };
}

// Format task details
function formatTaskDetails(tasks, limit = 10) {
  let result = '';
  tasks.slice(0, limit).forEach(t => {
    result += `• *[${t.id}]* ${t.description.substring(0, 50)}...\n`;
    result += `  PIC: ${t.pic || '-'} | Status: ${t.currentStatus}\n\n`;
  });
  if (tasks.length > limit) {
    result += `_...dan ${tasks.length - limit} task lainnya_\n`;
  }
  return result;
}

// Format status counter
function formatStatusCounter(tasks) {
  const counter = {};
  tasks.forEach(t => {
    const status = t.currentStatus || 'Unknown';
    counter[status] = (counter[status] || 0) + 1;
  });
  
  let result = '';
  const statusOrder = ['On Progress', 'Ready to Test', 'On Testing', 'Ready to Deploy', 'Deployed', 'Done'];
  statusOrder.forEach(s => {
    if (counter[s]) {
      result += `• ${s}: ${counter[s]}\n`;
    }
  });
  // Others
  Object.entries(counter).forEach(([s, count]) => {
    if (!statusOrder.includes(s)) {
      result += `• ${s}: ${count}\n`;
    }
  });
  return result;
}

// Generate response
async function generateResponse(question) {
  const { app, module, queryType, originalText } = parseQuestion(question);
  
  if (!app && !module) {
    return `Mau tanya apa? Contoh:\n• "detail ERET / ROS"\n• "detail CoreTax - BPHTB - Penagihan"\n• "status Pajak Online"`;
  }
  
  try {
    // Fetch current tasks
    const tasks = await sheets.getCurrentTasksFlat();
    
    // Filter by app
    let filtered = tasks;
    if (app) {
      filtered = tasks.filter(t => 
        t.app.toLowerCase().includes(app.toLowerCase())
      );
    }
    
    // Filter by module if specified
    if (module) {
      filtered = filtered.filter(t => 
        t.module.toLowerCase().includes(module.toLowerCase())
      );
    }
    
    if (filtered.length === 0) {
      return `Tidak ditemukan task untuk "${app}${module ? ' - ' + module : ''}"`;
    }
    
    // Check if too many results
    if (filtered.length > MAX_ITEMS_DIRECT) {
      // Show counter first
      let response = `📊 *${app}${module ? ' - ' + module : ''}*\n`;
      response += `Total: ${filtered.length} task\n\n`;
      response += `*Status:*\n`;
      response += formatStatusCounter(filtered);
      response += `\n_Mau lihat detail status yang mana?_\n`;
      response += `_Contoh: "detail ${app} - On Progress"_`;
      return response;
    }
    
    // Show details directly
    let response = `📋 *${app}${module ? ' - ' + module : ''}*\n`;
    response += `Total: ${filtered.length} task\n\n`;
    response += formatTaskDetails(filtered);
    return response;
    
  } catch (error) {
    console.error('Error generating response:', error);
    return `Maaf, ada error saat mengambil data: ${error.message}`;
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const { event, payload } = req.body;
    
    // Only handle message events
    if (event !== 'message') {
      return res.sendStatus(200);
    }
    
    const message = payload;
    const chatId = message.from;
    const text = message.body || '';
    const isGroup = chatId.includes('@g.us');
    
    // Only respond in configured groups
    if (isGroup && !GROUP_IDS.includes(chatId)) {
      return res.sendStatus(200);
    }
    
    // Check if mentioned
    const isMentioned = text.includes(`@${MENTION_NUMBER}`) || 
                        (message.mentionedIds && message.mentionedIds.includes(MENTION_NUMBER));
    
    if (!isMentioned) {
      return res.sendStatus(200);
    }
    
    // Check if message is task-related
    if (!isTaskRelated(text)) {
      console.log(`[${new Date().toISOString()}] Mentioned but not task-related, ignoring: ${text}`);
      return res.sendStatus(200);
    }
    
    console.log(`[${new Date().toISOString()}] Task query in ${chatId}: ${text}`);
    
    // Generate response
    const response = await generateResponse(text);
    
    // Random delay
    const delay = randomDelay();
    console.log(`Waiting ${delay}ms before responding...`);
    
    setTimeout(async () => {
      try {
        // Send with typing indicator
        await waha.sendMessageWithTyping(chatId, response, 3000);
        console.log('Response sent!');
      } catch (err) {
        console.error('Error sending response:', err);
      }
    }, delay);
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
