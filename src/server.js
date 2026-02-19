require('dotenv').config();

const express = require('express');
const WahaService = require('./waha');
const SheetsService = require('./sheets');
const ReportGenerator = require('./report');
const AIService = require('./ai');

const app = express();
app.use(express.json());

const waha = new WahaService();
const sheets = new SheetsService();
const ai = new AIService();

// Bot's identifiers (will be detected automatically)
let botNumber = null;
let botLid = null;

// Message deduplication - prevent double responses
const processedMessages = new Set();
const MESSAGE_CACHE_TTL = 120000; // 2 minutes (longer for delayed events)

function getMessageKey(message) {
  // Create a unique key from multiple attributes
  const from = message.from || '';
  const body = (message.body || '').substring(0, 50);
  const timestamp = message.timestamp || message._data?.t || '';
  // Combine for unique key
  return `${from}:${timestamp}:${body}`;
}

function isMessageProcessed(message) {
  const key = getMessageKey(message);
  if (processedMessages.has(key)) {
    return true;
  }
  processedMessages.add(key);
  // Clean up old entries
  setTimeout(() => processedMessages.delete(key), MESSAGE_CACHE_TTL);
  return false;
}

// Random delay helper (30-60 seconds)
function randomDelay() {
  const min = 30000; // 30 seconds
  const max = 60000; // 60 seconds
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Test group ID
const TEST_GROUP = '120363422153782210@g.us';

/**
 * Get bot's phone number and LID from WAHA
 */
async function getBotIdentifiers() {
  if (botNumber && botLid) return { botNumber, botLid };
  try {
    const me = await waha.getMe();
    botNumber = me.id.replace('@c.us', '');
    // LID is typically in the format seen in group messages
    // We'll also detect it from incoming messages
    console.log(`Bot number: ${botNumber}`);
    
    // Try to get LID from profile
    try {
      const profile = await waha.getProfile();
      if (profile && profile.wid) {
        botLid = profile.wid.user;
        console.log(`Bot LID: ${botLid}`);
      }
    } catch (e) {
      // LID not available yet, will be detected from messages
    }
    
    return { botNumber, botLid };
  } catch (e) {
    console.error('Failed to get bot identifiers:', e.message);
    return { botNumber: null, botLid: null };
  }
}

// Also set known LID from observation
botLid = '116144639856855';

/**
 * Check if message mentions the bot or is a reply to bot's message
 */
function isBotMentioned(message) {
  if (!message) return false;
  
  const body = message.body || '';
  
  // Get mentioned JIDs from message data
  const mentionedJidList = message._data?.mentionedJidList || [];
  
  // Check if bot's LID is in mentioned list
  if (botLid && mentionedJidList.some(jid => {
    const user = jid.user || jid._serialized?.split('@')[0];
    return user === botLid;
  })) {
    console.log('Bot mentioned via LID');
    return true;
  }
  
  // Check if bot's phone number is in mentioned list
  if (botNumber && mentionedJidList.some(jid => {
    const user = jid.user || jid._serialized?.split('@')[0];
    return user === botNumber;
  })) {
    console.log('Bot mentioned via phone number');
    return true;
  }
  
  // Check if message body contains @botLid or @botNumber
  if (botLid && body.includes(`@${botLid}`)) {
    console.log('Bot mentioned in body via LID');
    return true;
  }
  
  if (botNumber && body.includes(`@${botNumber}`)) {
    console.log('Bot mentioned in body via phone');
    return true;
  }
  
  // Check if message is a quoted reply to bot's message
  const quotedParticipant = message._data?.quotedParticipant;
  if (quotedParticipant) {
    const quotedUser = quotedParticipant.user || quotedParticipant._serialized?.split('@')[0];
    if (botLid && quotedUser === botLid) {
      console.log('Reply to bot message (LID)');
      return true;
    }
    if (botNumber && quotedUser === botNumber) {
      console.log('Reply to bot message (phone)');
      return true;
    }
  }
  
  return false;
}

/**
 * Check if message is task-related
 */
function isTaskRelated(body) {
  const lower = body.toLowerCase();
  
  // Task-related keywords
  const taskKeywords = [
    'task', 'tiket', 'ticket', 'modul', 'module', 'status',
    'pic', 'progress', 'deploy', 'testing', 'test',
    'report', 'laporan', 'weekly', 'mingguan',
    'aplikasi', 'app', 'fitur', 'feature',
    'coretax', 'bphtb', 'reklame', 'pbb', 'sim pbb',
    'eret', 'ros', 'pajak', 'pendataan', 'penetapan',
    'penagihan', 'pelayanan', 'verifikasi', 'sspd',
    'help', 'bantuan', 'ada berapa', 'siapa', 'apa saja',
    'list', 'daftar', 'nomor', 'id'
  ];
  
  return taskKeywords.some(keyword => lower.includes(keyword));
}

/**
 * Parse command from message
 */
function parseCommand(body) {
  const lower = body.toLowerCase();
  
  // Remove mention from body for cleaner parsing
  const cleanBody = body.replace(/@\d+/g, '').trim();
  const cleanLower = cleanBody.toLowerCase();
  
  if (cleanLower === '/report' || cleanLower === 'report' || cleanLower === 'laporan') {
    return 'report';
  }
  if (cleanLower === '/help' || cleanLower === 'help' || cleanLower === 'bantuan' || cleanLower === '?') {
    return 'help';
  }
  if (cleanLower === '/status' || cleanLower === 'status') {
    return 'status';
  }
  
  // If it's a question or longer text, use AI
  if (cleanBody.length > 5) {
    return 'ai';
  }
  
  return 'default';
}

/**
 * Get task data context for AI - includes ALL tasks from Current sheet
 */
async function getTaskContext() {
  try {
    // Get new tasks summary from Dashboard (row 576+)
    const newTasksData = await sheets.getNewTasksLastWeek();
    
    // Get ALL tasks from Current sheet
    const allTasksData = await sheets.fetchSheet('Current');
    const rows = allTasksData.table.rows;
    
    let context = `=== TASK BARU MINGGU INI (${newTasksData.dateRange || 'N/A'}) ===\n`;
    context += `Total: ${newTasksData.tasks.reduce((sum, t) => sum + t.total, 0)} task baru\n`;
    newTasksData.tasks.forEach(task => {
      context += `• ${task.app} - ${task.module}: ${task.total} task (P:${task.onProgress} T:${task.readyToTest} Tg:${task.onTesting} D:${task.readyToDeploy})\n`;
    });
    
    context += `\n=== SEMUA TASK AKTIF ===\n`;
    
    let count = 0;
    rows.forEach(row => {
      if (count >= 150) return; // Limit to avoid token overflow
      
      const c = row.c || [];
      const id = c[0]?.v || c[0]?.f || '';
      const app = c[1]?.v || '';
      const module = c[2]?.v || '';
      const desc = (c[3]?.v || '').substring(0, 50).replace(/\n/g, ' ');
      const pic = c[8]?.v || '';
      const status = c[12]?.v || '';
      const resolved = c[11]?.v === true;
      
      if (!id || resolved) return;
      
      context += `[${id}] ${app} > ${module} | ${desc} | PIC: ${pic} | Status: ${status}\n`;
      count++;
    });
    
    context += `\nTotal task aktif ditampilkan: ${count}\n`;
    
    return context;
  } catch (e) {
    console.error('Failed to get task context:', e.message);
    return 'Data task tidak tersedia: ' + e.message;
  }
}

/**
 * Answer question using AI
 */
async function answerWithAI(question, chatId) {
  try {
    const context = await getTaskContext();
    const answer = await ai.answer(question, context);
    await waha.sendMessage(chatId, answer);
    return true;
  } catch (e) {
    // Silent fail - just log, don't send error to user
    console.error('AI Error (silent):', e.message);
    return false;
  }
}

/**
 * Generate help message
 */
function getHelpMessage() {
  return `🤖 *PM Bot - Bantuan*

Mention saya dengan salah satu perintah:

📊 *report* / *laporan*
→ Kirim weekly report sekarang

📈 *status*
→ Lihat status ringkasan task

❓ *help* / *bantuan*
→ Tampilkan pesan ini

🤖 *Tanya AI*
→ Tanya apa saja tentang task!

_Contoh:_
• @628xxx report
• @628xxx task apa yang On Progress di ERET?
• @628xxx siapa PIC task 3621?
• @628xxx modul Penetapan ada berapa task?`;
}

/**
 * Generate quick status message
 */
async function getStatusMessage() {
  try {
    const newTasksData = await sheets.getNewTasksLastWeek();
    const totalTasks = newTasksData.tasks.reduce((sum, t) => sum + t.total, 0);
    const totalProgress = newTasksData.tasks.reduce((sum, t) => sum + t.onProgress, 0);
    const totalTest = newTasksData.tasks.reduce((sum, t) => sum + t.readyToTest, 0);
    const totalTesting = newTasksData.tasks.reduce((sum, t) => sum + t.onTesting, 0);
    const totalDeploy = newTasksData.tasks.reduce((sum, t) => sum + t.readyToDeploy, 0);
    
    return `📈 *Status Minggu Ini*
_Periode: ${newTasksData.dateRange || 'N/A'}_

📊 *${totalTasks} task baru*
• On Progress: ${totalProgress}
• Ready to Test: ${totalTest}
• On Testing: ${totalTesting}
• Ready to Deploy: ${totalDeploy}

_Ketik "report" untuk detail lengkap_`;
  } catch (e) {
    return `❌ Gagal mengambil status: ${e.message}`;
  }
}

/**
 * Generate and send full report
 */
async function sendFullReport(chatId) {
  try {
    const newTasksData = await sheets.getNewTasksLastWeek();
    const taskDetails = await sheets.getTaskDetails();
    const statusChanges = await sheets.getStatusChanges(7);
    
    const generator = new ReportGenerator(newTasksData, taskDetails, statusChanges);
    const report = generator.generate();
    
    await waha.sendMessage(chatId, report);
    return true;
  } catch (e) {
    await waha.sendMessage(chatId, `❌ Gagal generate report: ${e.message}`);
    return false;
  }
}

/**
 * Handle incoming message
 */
async function handleMessage(message) {
  // Ensure we have bot identifiers
  await getBotIdentifiers();
  
  // Only respond if bot is mentioned
  if (!isBotMentioned(message)) {
    return;
  }
  
  const chatId = message.from;
  const body = message.body || '';
  
  // Skip non-task-related messages (meeting invites, greetings, etc.)
  if (!isTaskRelated(body)) {
    console.log(`[${new Date().toISOString()}] Skipping non-task message: "${body.substring(0, 50)}"`);
    return;
  }
  
  const command = parseCommand(body);
  
  console.log(`[${new Date().toISOString()}] Mentioned in ${chatId}: "${body}" -> command: ${command}`);
  
  // Random delay before responding (10-30 seconds)
  const delay = randomDelay();
  console.log(`Waiting ${delay/1000}s before responding...`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Add typing indicator
  await waha.sendTyping(chatId, true);
  
  try {
    switch (command) {
      case 'report':
        await sendFullReport(chatId);
        break;
      
      case 'status':
        const status = await getStatusMessage();
        await waha.sendMessage(chatId, status);
        break;
      
      case 'help':
        await waha.sendMessage(chatId, getHelpMessage());
        break;
      
      case 'ai':
        // Remove mention from question
        const question = body.replace(/@\d+/g, '').trim();
        await answerWithAI(question, chatId);
        break;
      
      default:
        await waha.sendMessage(chatId, getHelpMessage());
        break;
    }
  } catch (e) {
    console.error('Error handling message:', e.message);
    await waha.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
  
  // Stop typing
  await waha.sendTyping(chatId, false);
}

// Webhook endpoint for WAHA
app.post('/webhook', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Webhook received`);
    console.log('Full payload:', JSON.stringify(req.body, null, 2).substring(0, 1500));
    
    const { event, payload } = req.body;
    
    // Handle different event formats (WAHA can send in different formats)
    let message = payload;
    
    // Some WAHA versions send the message directly without event wrapper
    if (!event && req.body.id) {
      message = req.body;
    }
    
    // Only handle 'message' event (ignore 'message.any' to prevent duplicates)
    if (event === 'message') {
      // Ignore messages from self
      if (message.fromMe) {
        console.log('Ignoring self message');
        return res.json({ status: 'ignored', reason: 'from self' });
      }
      
      // Deduplicate - prevent double processing from message + message.any events
      if (isMessageProcessed(message)) {
        console.log(`Ignoring duplicate message from ${message.from}`);
        return res.json({ status: 'ignored', reason: 'duplicate' });
      }
      
      console.log(`Processing message from: ${message.from}, body: ${(message.body || '').substring(0, 50)}`);
      
      // Handle the message (async, don't wait)
      handleMessage(message).catch(e => console.error('Handle error:', e));
    }
    
    res.json({ status: 'ok' });
  } catch (e) {
    console.error('Webhook error:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pm-bot-webhook' });
});

// Start server
const PORT = process.env.WEBHOOK_PORT || 3003;

function startServer() {
  // Listen on all interfaces (0.0.0.0) for Docker access
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PM Bot webhook server running on 0.0.0.0:${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`Bot LID (hardcoded): ${botLid}`);
    
    // Get bot identifiers on startup
    getBotIdentifiers();
  });
}

module.exports = { startServer, app };

// Start server if run directly
if (require.main === module) {
  startServer();
}
