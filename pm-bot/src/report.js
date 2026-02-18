class ReportGenerator {
  constructor(statusComparison, tasksByApp) {
    this.comparison = statusComparison.comparison;
    this.totals = statusComparison.totals;
    this.tasksByApp = tasksByApp;
  }

  generate() {
    const dateStr = new Date().toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let report = `📊 *WEEKLY STATUS REPORT*\n`;
    report += `_${dateStr}_\n`;
    report += `_Status per Aplikasi_\n\n`;

    // Sort by total tasks (most tasks first)
    const sorted = [...this.comparison]
      .filter(a => a.totalNow > 5) // Only apps with >5 tasks
      .sort((a, b) => b.totalNow - a.totalNow);

    // Top 10 apps
    sorted.slice(0, 10).forEach(a => {
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📱 *${a.app}*\n`;
      report += `Total: ${a.totalNow}\n\n`;
      
      // Status counts
      report += `📊 *Status:*\n`;
      if (a.progressNow > 0) {
        report += `• On Progress: ${a.progressNow}\n`;
      }
      if (a.testNow > 0) {
        report += `• Ready to Test: ${a.testNow}\n`;
      }
      if (a.testingNow > 0) {
        report += `• On Testing: ${a.testingNow}\n`;
      }
      if (a.deployNow > 0) {
        report += `• Ready to Deploy: ${a.deployNow}\n`;
      }
      
      // Task names (On Progress)
      const tasks = this.tasksByApp[a.app] || {};
      if (tasks['On Progress']?.length > 0) {
        report += `\n🔧 *On Progress:*\n`;
        tasks['On Progress'].slice(0, 3).forEach(t => {
          report += `• [${t.id}] ${t.desc}...\n`;
        });
        if (tasks['On Progress'].length > 3) {
          report += `_+${tasks['On Progress'].length - 3} lainnya_\n`;
        }
      }
      
      report += `\n`;
    });

    // Summary
    if (this.totals) {
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📈 *TOTAL SEMUA APP*\n`;
      report += `Total Task: ${this.totals.totalNow}\n`;
      report += `On Progress: ${this.totals.progressNow}\n`;
      report += `Ready to Test: ${this.totals.testNow}\n`;
      report += `On Testing: ${this.totals.testingNow}\n`;
      report += `Ready to Deploy: ${this.totals.deployNow}\n`;
    }

    return report;
  }
}

module.exports = ReportGenerator;
