const axios = require('axios');

class SheetsService {
  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID;
  }

  async fetchSheet(sheetName, range = '') {
    const rangeParam = range ? `&range=${encodeURIComponent(range)}` : '';
    const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}${rangeParam}`;
    
    const response = await axios.get(url);
    const jsonStr = response.data.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
    if (!jsonStr) {
      throw new Error('Failed to parse Google Sheets response');
    }
    
    return JSON.parse(jsonStr[1]);
  }

  /**
   * Get NEW TASKS LAST WEEK data from Dashboard row 576+
   * Returns: { dateRange, tasks: [{ app, module, total, onProgress, readyToTest, onTesting, readyToDeploy, done }] }
   */
  async getNewTasksLastWeek() {
    // Read from row 574 onwards to capture header
    const data = await this.fetchSheet('Dashboard', 'A574:J610');
    const rows = data.table.rows;
    
    let dateRange = '';
    const tasks = [];
    let inNewTasksSection = false;
    
    rows.forEach((row, idx) => {
      const c = row.c || [];
      const col0 = c[0]?.v || '';
      
      // Find header with date range: "NEW TASKS LAST WEEK (date - date)"
      if (col0.includes('NEW TASKS LAST WEEK')) {
        const match = col0.match(/\(([^)]+)\)/);
        dateRange = match ? match[1] : '';
        inNewTasksSection = true;
        return;
      }
      
      // Skip column header row (App | Module | ...)
      if (col0 === 'App') {
        return;
      }
      
      // Stop at TOTAL or next section
      if (col0 === 'TOTAL' || col0.includes('WEEKLY PROGRESS') || col0.includes('Subtotal')) {
        if (inNewTasksSection) {
          inNewTasksSection = false; // End of section
        }
        return;
      }
      
      // Only process rows in NEW TASKS section
      if (!inNewTasksSection) return;
      
      // Data rows: App | Module | Total | OnProgress | ReadyToTest | OnTesting | ReadyToDeploy | ? | Done
      const app = col0;
      const module = c[1]?.v || '';
      const total = c[2]?.v || 0;
      
      // Skip invalid rows (no app name, no module, or zero total)
      if (!app || !module || total === 0) return;
      
      tasks.push({
        app,
        module,
        total: parseInt(total) || 0,
        onProgress: parseInt(c[3]?.v) || 0,
        readyToTest: parseInt(c[4]?.v) || 0,
        onTesting: parseInt(c[5]?.v) || 0,
        readyToDeploy: parseInt(c[6]?.v) || 0,
        done: parseInt(c[8]?.v) || 0,
      });
    });
    
    return { dateRange, tasks };
  }

  /**
   * Parse date from Google Sheets format
   * Handles: Date(year,month,day), "YYYY-MM-DD", or null
   */
  parseDate(raw) {
    if (!raw) return null;
    
    if (typeof raw === 'string' && raw.startsWith('Date(')) {
      const match = raw.match(/Date\((\d+),(\d+),(\d+)/);
      if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
      }
    }
    
    // Try parsing as date string
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    
    return null;
  }

  /**
   * Get task details from Current sheet for specific tasks
   * Includes deadline (Estimated Date) for overdue detection
   */
  async getTaskDetails(appModulePairs) {
    const data = await this.fetchSheet('Current');
    const rows = data.table.rows;
    
    const details = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    rows.forEach(row => {
      const c = row.c || [];
      const id = c[0]?.v || c[0]?.f;
      const app = c[1]?.v || '';
      const module = c[2]?.v || '';
      const desc = (c[3]?.v || '').substring(0, 40).replace(/\n/g, ' ').trim();
      const status = c[12]?.v || '';
      const resolved = c[11]?.v === true;
      
      // Parse deadline (Estimated Date - column 6)
      const deadlineRaw = c[6]?.v;
      const deadline = this.parseDate(deadlineRaw);
      
      // Check if overdue (deadline passed and not resolved)
      let isOverdue = false;
      if (deadline && !resolved && deadline < today) {
        isOverdue = true;
      }
      
      if (!id || !app) return;
      
      // Check if this task belongs to one of the new tasks
      const key = `${app}|${module}`;
      if (!details[key]) details[key] = [];
      
      details[key].push({ 
        id, 
        desc, 
        status, 
        resolved,
        deadline,
        isOverdue
      });
    });
    
    return details;
  }

  /**
   * Get STATUS_CHANGE entries from Changelog within date range
   * Enriches with module name from Current sheet
   * Returns: [{ timestamp, id, app, module, pic, oldStatus, newStatus }]
   */
  async getStatusChanges(daysBack = 7) {
    const data = await this.fetchSheet('Changelog', 'A1:H2000');
    const rows = data.table.rows;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const changes = [];
    
    rows.forEach(row => {
      const c = row.c || [];
      const changeType = c[4]?.v || '';
      const field = c[5]?.v || '';
      
      // Only STATUS_CHANGE on Status field
      if (changeType !== 'STATUS_CHANGE' || field !== 'Current Status') return;
      
      // Parse timestamp - format: Date(year,month,day,hour,min,sec)
      const tsRaw = c[0]?.v;
      let timestamp;
      if (typeof tsRaw === 'string' && tsRaw.startsWith('Date(')) {
        const match = tsRaw.match(/Date\((\d+),(\d+),(\d+)/);
        if (match) {
          timestamp = new Date(match[1], match[2], match[3]);
        }
      }
      
      // Filter by date
      if (!timestamp || timestamp < cutoffDate) return;
      
      changes.push({
        timestamp,
        id: c[1]?.v || '',
        app: c[2]?.v || '',
        pic: c[3]?.v || '',
        oldStatus: c[6]?.v || '',
        newStatus: c[7]?.v || '',
        module: '', // Will be enriched later
      });
    });
    
    // Enrich with module names from Current sheet
    if (changes.length > 0) {
      const currentData = await this.fetchSheet('Current');
      const taskModules = {};
      
      currentData.table.rows.forEach(row => {
        const c = row.c || [];
        const id = String(c[0]?.v || c[0]?.f || '');
        const module = c[2]?.v || '';
        if (id && module) {
          taskModules[id] = module;
        }
      });
      
      // Add module to each change
      changes.forEach(ch => {
        ch.module = taskModules[String(ch.id)] || '';
      });
    }
    
    return changes;
  }
}

module.exports = SheetsService;
