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

  async getStatusComparison() {
    // Dashboard row 1-32: TASK SUMMARY PER APP
    const data = await this.fetchSheet('Dashboard', 'A1:I35');
    const rows = data.table.rows;
    
    const comparison = [];
    rows.forEach(row => {
      const c = row.c || [];
      const app = c[0]?.v;
      if (!app || app === 'TOTAL' || app.includes('TASK SUMMARY')) return;
      
      comparison.push({
        app,
        totalNow: c[1]?.v || 0,
        progressNow: c[2]?.v || 0,
        testNow: c[3]?.v || 0,
        testingNow: c[4]?.v || 0,
        deployNow: c[5]?.v || 0,
        deployedNow: c[6]?.v || 0,
        doneNow: c[7]?.v || 0,
        otherNow: c[8]?.v || 0,
      });
    });
    
    // Get totals
    const totalRow = rows.find(r => r.c[0]?.v === 'TOTAL');
    const totals = totalRow ? {
      totalNow: totalRow.c[1]?.v || 0,
      progressNow: totalRow.c[2]?.v || 0,
      testNow: totalRow.c[3]?.v || 0,
      testingNow: totalRow.c[4]?.v || 0,
      deployNow: totalRow.c[5]?.v || 0,
      deployedNow: totalRow.c[6]?.v || 0,
      doneNow: totalRow.c[7]?.v || 0,
    } : null;
    
    return { comparison, totals };
  }

  async getCurrentTasks() {
    // Current sheet: all tasks
    const data = await this.fetchSheet('Current');
    const rows = data.table.rows;
    
    const tasksByApp = {};
    rows.forEach(row => {
      const c = row.c || [];
      const id = c[0]?.v || c[0]?.f;
      const app = c[1]?.v || '';
      const desc = (c[3]?.v || '').substring(0, 35).replace(/\n/g, ' ');
      const status = c[12]?.v || '';
      const resolved = c[11]?.v === true;
      
      if (!id || !app || resolved) return;
      
      if (!tasksByApp[app]) tasksByApp[app] = {};
      if (!tasksByApp[app][status]) tasksByApp[app][status] = [];
      tasksByApp[app][status].push({ id, desc });
    });
    
    return tasksByApp;
  }
}

module.exports = SheetsService;
