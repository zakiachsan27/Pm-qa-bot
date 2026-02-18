const axios = require('axios');

class SheetsService {
  constructor() {
    this.sheetId = process.env.GOOGLE_SHEET_ID;
  }

  async getTaskData() {
    // Use Google Sheets public export as CSV
    const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:json`;
    
    const response = await axios.get(url);
    
    // Google returns JSONP-like format, need to extract JSON
    const jsonStr = response.data.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
    if (!jsonStr) {
      throw new Error('Failed to parse Google Sheets response');
    }
    
    const data = JSON.parse(jsonStr[1]);
    const rows = data.table.rows;
    
    // Skip header row (index 0), map to task objects
    return rows.slice(1).map(row => {
      const cells = row.c || [];
      const getValue = (idx) => cells[idx]?.v || '';
      
      return {
        no: getValue(0),
        tglMasuk: getValue(1),
        platform: getValue(2),
        namaProject: getValue(3),
        moduleFitur: getValue(4),
        requester: getValue(5),
        linkQARequest: getValue(6),
        deadline: getValue(7),
        disiQA: getValue(8),
        statusQA: getValue(9),
        picQA: getValue(10),
        scopeSize: getValue(11),
        priority: getValue(12),
        tglMulaiQA: getValue(13),
        tglSelesaiQA: getValue(14),
        tglOverdueQA: getValue(15),
        linkDokumentasi: getValue(16),
        catatanQA: getValue(17),
        incidentId: getValue(18),
      };
    }).filter(task => task.no); // Filter out empty rows
  }
}

module.exports = SheetsService;
