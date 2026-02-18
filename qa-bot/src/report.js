class ReportGenerator {
  constructor(tasks) {
    this.tasks = tasks;
    this.urgentDaysThreshold = parseInt(process.env.URGENT_DAYS_THRESHOLD) || 5;
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Handle Google Sheets date format: "Date(2026,0,27)"
    const googleMatch = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
    if (googleMatch) {
      const year = parseInt(googleMatch[1]);
      const month = parseInt(googleMatch[2]); // 0-indexed
      const day = parseInt(googleMatch[3]);
      return new Date(year, month, day);
    }
    
    // Handle formats: "19-Jan", "03-Mar", "11-Feb", etc.
    const months = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    const match = dateStr.match(/(\d{1,2})-(\w{3})/i);
    if (match) {
      const day = parseInt(match[1]);
      const month = months[match[2].toLowerCase()];
      const year = new Date().getFullYear();
      return new Date(year, month, day);
    }
    
    return null;
  }

  formatDateDisplay(dateStr) {
    const date = this.parseDate(dateStr);
    if (!date) return dateStr;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()}-${months[date.getMonth()]}`;
  }

  parseScopeSize(scopeStr) {
    // Extract number from "5 hari", "8 hari", "13 hari"
    const match = scopeStr?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  getDaysUntilDeadline(deadline) {
    const deadlineDate = this.parseDate(deadline);
    if (!deadlineDate) return Infinity;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);
    
    const diffTime = deadlineDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  getInProgressTasks() {
    return this.tasks.filter(t => 
      t.statusQA?.toLowerCase().includes('progress') ||
      t.statusQA?.toLowerCase().includes('overdue')
    );
  }

  getUrgentTasks() {
    return this.tasks.filter(t => {
      const days = this.getDaysUntilDeadline(t.deadline);
      return days <= this.urgentDaysThreshold && days >= 0 && 
             (t.statusQA?.toLowerCase().includes('progress') || 
              t.statusQA?.toLowerCase().includes('overdue'));
    }).sort((a, b) => 
      this.getDaysUntilDeadline(a.deadline) - this.getDaysUntilDeadline(b.deadline)
    );
  }

  getPastDueTasks() {
    // Tasks where deadline (column H) has passed AND no QA assigned yet (PIC QA empty)
    return this.tasks.filter(t => {
      if (!t.deadline) return false;
      
      const days = this.getDaysUntilDeadline(t.deadline);
      const hasPIC = t.picQA && t.picQA.trim() !== '';
      
      // Past deadline (days < 0) and no PIC assigned
      return days < 0 && !hasPIC;
    }).sort((a, b) => {
      return this.getDaysUntilDeadline(a.deadline) - this.getDaysUntilDeadline(b.deadline);
    });
  }

  getWorkloadByQA() {
    // Known QA members
    const knownQA = ['Ifany', 'Riska', 'Aghni', 'Sofi'];
    const workload = {};
    
    // Initialize all known QA with 0
    knownQA.forEach(qa => {
      workload[qa] = 0;
    });
    
    this.getInProgressTasks().forEach(t => {
      const pic = t.picQA?.trim();
      if (pic) {
        const scope = this.parseScopeSize(t.scopeSize);
        
        // Check if it's a combined assignment like "Aghni & Sofi"
        if (pic.includes('&')) {
          // Split by & and add workload to each person
          const people = pic.split('&').map(p => p.trim());
          people.forEach(person => {
            if (workload.hasOwnProperty(person)) {
              workload[person] += scope;
            }
          });
        } else {
          // Single person assignment
          workload[pic] = (workload[pic] || 0) + scope;
        }
      }
    });
    
    // Sort by workload descending
    return Object.entries(workload)
      .sort((a, b) => b[1] - a[1])
      .map(([name, days]) => ({ name, days }));
  }

  getAvailableQA() {
    const workload = this.getWorkloadByQA();
    if (workload.length === 0) return [];
    
    // Only QA with 0 workload (no tasks) are available
    return workload
      .filter(w => w.days === 0)
      .map(w => w.name);
  }

  formatDeadline(deadline) {
    const days = this.getDaysUntilDeadline(deadline);
    const dateDisplay = this.formatDateDisplay(deadline);
    if (days === 0) return `${dateDisplay} - HARI INI!`;
    if (days === 1) return `${dateDisplay} - BESOK!`;
    if (days < 0) return `${dateDisplay} - OVERDUE`;
    return `${dateDisplay} - ${days} hari lagi`;
  }

  generate() {
    const inProgress = this.getInProgressTasks();
    const urgent = this.getUrgentTasks();
    const workload = this.getWorkloadByQA();
    const available = this.getAvailableQA();

    let report = `Selamat pagi tim QA!\n\n`;

    // Tasks In Progress + Overdue
    report += `📋 *Task In Progress / Overdue:*\n`;
    if (inProgress.length === 0) {
      report += `• Tidak ada task in progress\n`;
    } else {
      inProgress.forEach(t => {
        const taskName = (t.namaProject || '').replace(/\n/g, ' ').trim();
        // Use tglOverdueQA (col P) if available, otherwise tglSelesaiQA (col O)
        const targetDate = t.tglOverdueQA || t.tglSelesaiQA;
        const dateDisplay = targetDate ? this.formatDateDisplay(targetDate) : '-';
        const status = t.statusQA?.toLowerCase() === 'overdue' ? ' [OVERDUE]' : '';
        report += `• [${taskName}]\n  ${t.picQA}, target: ${dateDisplay}${status}\n\n`;
      });
    }

    // Urgent Tasks (deadline < 5 days)
    report += `⚠️ *Task Urgent - Deadline < ${this.urgentDaysThreshold} hari:*\n`;
    if (urgent.length === 0) {
      report += `• Tidak ada task urgent\n`;
    } else {
      urgent.forEach(t => {
        const taskName = (t.namaProject || '').replace(/\n/g, ' ').trim();
        report += `• [${taskName}]\n  ${t.picQA}, ${this.formatDeadline(t.deadline)}\n\n`;
      });
    }

    // Tasks past deadline and no QA assigned yet
    const pastDue = this.getPastDueTasks();
    report += `🚨 *Antrian Task Lewat Deadline:*\n`;
    if (pastDue.length === 0) {
      report += `• Tidak ada\n`;
    } else {
      pastDue.forEach(t => {
        const taskName = (t.namaProject || '').replace(/\n/g, ' ').trim();
        const deadlineDisplay = this.formatDateDisplay(t.deadline);
        const daysLate = Math.abs(this.getDaysUntilDeadline(t.deadline));
        report += `• [${taskName}]\n  Deadline: ${deadlineDisplay} (${daysLate} hari lalu)\n\n`;
      });
    }

    // Workload - show all individual QA
    report += `📊 *Workload QA:*\n`;
    if (workload.length === 0) {
      report += `• Tidak ada data workload\n`;
    } else {
      workload.forEach(w => {
        report += `• ${w.name}: ${w.days} hari\n`;
      });
    }
    report += `\n`;

    // Available for Urgent
    report += `✅ *Available untuk Urgent:*\n`;
    if (available.length === 0) {
      report += `• Semua QA sedang full\n`;
    } else {
      available.forEach(name => {
        report += `• ${name}\n`;
      });
    }
    report += `\n`;

    // Closing
    report += `Semangat testing hari ini! 💪`;

    return report;
  }
}

module.exports = ReportGenerator;
