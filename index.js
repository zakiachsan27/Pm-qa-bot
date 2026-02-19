require('dotenv').config();

const cron = require('node-cron');
const SheetsService = require('./src/sheets');
const ReportGenerator = require('./src/report');
const WahaService = require('./src/waha');

const sheets = new SheetsService();
const waha = new WahaService();

// Support multiple groups (comma-separated)
const groupIds = (process.env.WA_GROUP_IDS || '').split(',').filter(id => id.trim());
const groupSendDelay = parseInt(process.env.GROUP_SEND_DELAY) || 60000;

/**
 * Generate and send weekly PM report
 * Data source: Dashboard row 576+ "NEW TASKS LAST WEEK" section
 * Format: Per-app → per-module breakdown with full status names
 */
async function sendWeeklyReport() {
  try {
    console.log(`[${new Date().toISOString()}] Generating weekly PM report...`);
    
    // Get NEW TASKS LAST WEEK data from Dashboard row 576+
    const newTasksData = await sheets.getNewTasksLastWeek();
    console.log(`Date range: ${newTasksData.dateRange}`);
    console.log(`Found ${newTasksData.tasks.length} task entries`);
    
    // Get task details for context
    const taskDetails = await sheets.getTaskDetails();
    console.log(`Fetched task details`);
    
    // Get status changes from Changelog (last 7 days)
    const statusChanges = await sheets.getStatusChanges(7);
    console.log(`Found ${statusChanges.length} status changes`);
    
    // Generate report
    const generator = new ReportGenerator(newTasksData, taskDetails, statusChanges);
    const report = generator.generate();
    console.log('Report generated:');
    console.log(report);
    
    if (groupIds.length === 0) {
      console.log('No WA_GROUP_IDS configured. Report not sent.');
      return report;
    }
    
    // Send to all groups with delay between each
    console.log(`Sending to ${groupIds.length} group(s)...`);
    
    for (let i = 0; i < groupIds.length; i++) {
      const gid = groupIds[i].trim();
      
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
    console.error('Error sending weekly report:', error.message);
    throw error;
  }
}

async function testReport() {
  try {
    // Get NEW TASKS LAST WEEK data
    const newTasksData = await sheets.getNewTasksLastWeek();
    console.log(`Date range: ${newTasksData.dateRange}`);
    console.log(`New tasks: ${newTasksData.tasks.length}`);
    
    // Get task details
    const taskDetails = await sheets.getTaskDetails();
    
    // Get status changes
    const statusChanges = await sheets.getStatusChanges(7);
    console.log(`Status changes: ${statusChanges.length}`);
    
    const generator = new ReportGenerator(newTasksData, taskDetails, statusChanges);
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
    
    return groups;
  } catch (error) {
    console.error('WAHA test failed:', error.message);
    throw error;
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--test-sheets')) {
  testReport().catch(console.error);
} else if (args.includes('--test-waha')) {
  testWaha().catch(console.error);
} else if (args.includes('--send-now')) {
  sendWeeklyReport().catch(console.error);
} else if (args.includes('--cron')) {
  // Default: Every Monday 8 AM
  const schedule = process.env.REPORT_CRON || '0 8 * * 1';
  console.log(`Starting cron job with schedule: ${schedule}`);
  console.log('Timezone:', process.env.TIMEZONE || 'Asia/Jakarta');
  
  cron.schedule(schedule, () => {
    sendWeeklyReport().catch(console.error);
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Jakarta'
  });
  
  // Also start webhook server for mention replies
  const { startServer } = require('./src/server');
  startServer();
  
  console.log('Cron job started. Waiting for schedule...');
  console.log('Press Ctrl+C to exit.');
} else if (args.includes('--server')) {
  // Webhook server only
  const { startServer } = require('./src/server');
  startServer();
} else {
  console.log(`
Bapenda PM Weekly Report Bot
=============================

Usage:
  node index.js --test-sheets   Test Google Sheets connection & preview report
  node index.js --test-waha     Test WAHA connection & list groups
  node index.js --send-now      Send report immediately
  node index.js --cron          Start cron job (default: Monday 08:00)

Data Source: Dashboard row 576+ "NEW TASKS LAST WEEK" section
Format: Per-app → per-module breakdown with full status names
  `);
}

module.exports = { sendWeeklyReport, testReport, testWaha };
