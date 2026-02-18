require('dotenv').config();

const cron = require('node-cron');
const SheetsService = require('./src/sheets');
const ReportGenerator = require('./src/report');
const WahaService = require('./src/waha');

const sheets = new SheetsService();
const waha = new WahaService();

// Support multiple groups (comma-separated)
const groupIds = (process.env.WA_GROUP_IDS || process.env.WA_GROUP_ID || '').split(',').filter(id => id.trim());
const groupSendDelay = parseInt(process.env.GROUP_SEND_DELAY) || 60000; // Default 1 minute

async function findGroup() {
  const groupName = process.env.WA_GROUP_NAME;
  console.log(`Looking for group: ${groupName}`);
  
  const group = await waha.findGroupByName(groupName);
  if (group) {
    groupId = group.id;
    console.log(`Found group: ${group.name} (${groupId})`);
    return groupId;
  }
  
  throw new Error(`Group "${groupName}" not found!`);
}

async function sendDailyReport() {
  try {
    console.log(`[${new Date().toISOString()}] Generating daily report...`);
    
    // Get task data
    const tasks = await sheets.getTaskData();
    console.log(`Fetched ${tasks.length} tasks from Google Sheets`);
    
    // Generate report
    const generator = new ReportGenerator(tasks);
    const report = generator.generate();
    console.log('Report generated:');
    console.log(report);
    
    // Send to all groups with delay between each
    console.log(`Sending to ${groupIds.length} group(s)...`);
    
    for (let i = 0; i < groupIds.length; i++) {
      const gid = groupIds[i].trim();
      
      // Add delay before sending to subsequent groups (not the first one)
      if (i > 0) {
        console.log(`Waiting ${groupSendDelay/1000} seconds before sending to next group...`);
        await new Promise(resolve => setTimeout(resolve, groupSendDelay));
      }
      
      console.log(`[${i + 1}/${groupIds.length}] Sending to group: ${gid}`);
      await waha.sendMessageWithTyping(gid, report, 3000);
      console.log(`Sent to group ${i + 1} successfully!`);
    }
    
    console.log('All reports sent successfully!');
    return report;
    
  } catch (error) {
    console.error('Error sending daily report:', error.message);
    throw error;
  }
}

async function testReport() {
  try {
    const tasks = await sheets.getTaskData();
    console.log(`Fetched ${tasks.length} tasks`);
    console.log('Sample tasks:', tasks.slice(0, 3));
    
    const generator = new ReportGenerator(tasks);
    const report = generator.generate();
    console.log('\n--- REPORT PREVIEW ---');
    console.log(report);
    console.log('--- END PREVIEW ---\n');
    
    return report;
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

async function testWaha() {
  try {
    const status = await waha.getStatus();
    console.log('WAHA Status:', status);
    
    const groups = await waha.getGroups();
    console.log('\nAvailable Groups:');
    groups.forEach(g => {
      console.log(`- ${g.name} (${g.id})`);
    });
    
    await findGroup();
    return groups;
  } catch (error) {
    console.error('WAHA test failed:', error.message);
    throw error;
  }
}

async function sendNow() {
  return sendDailyReport();
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--test-sheets')) {
  testReport().catch(console.error);
} else if (args.includes('--test-waha')) {
  testWaha().catch(console.error);
} else if (args.includes('--send-now')) {
  sendNow().catch(console.error);
} else if (args.includes('--cron')) {
  // Run with cron schedule
  const schedule = process.env.REPORT_CRON || '0 8 * * 1-5';
  console.log(`Starting cron job with schedule: ${schedule}`);
  console.log('Timezone:', process.env.TIMEZONE || 'Asia/Jakarta');
  
  cron.schedule(schedule, () => {
    sendDailyReport().catch(console.error);
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Jakarta'
  });
  
  console.log('Cron job started. Waiting for schedule...');
  console.log('Press Ctrl+C to exit.');
} else {
  console.log(`
Bapenda QA Daily Report Bot
============================

Usage:
  node index.js --test-sheets   Test Google Sheets connection
  node index.js --test-waha     Test WAHA connection & list groups
  node index.js --send-now      Send report immediately
  node index.js --cron          Start cron job (08:00 Mon-Fri)
  `);
}

module.exports = { sendDailyReport, testReport, testWaha };
