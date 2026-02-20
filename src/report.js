/**
 * PM Weekly Report Generator
 * Format: Per-app → per-module breakdown with full status names
 * Data source: 
 *   - Dashboard row 576+ "NEW TASKS LAST WEEK" section
 *   - Changelog STATUS_CHANGE entries
 */
class ReportGenerator {
  constructor(newTasksData, taskDetails, statusChanges = []) {
    this.dateRange = newTasksData.dateRange;
    this.tasks = newTasksData.tasks;
    this.taskDetails = taskDetails || {};
    this.statusChanges = statusChanges;
  }

  /**
   * Get status label with emoji
   */
  getStatusLabel(status) {
    const labels = {
      'On Progress': '🔧 On Progress',
      'Ready to Test': '🧪 Ready to Test', 
      'On Testing': '⏳ On Testing',
      'Ready to Deploy': '🚀 Ready to Deploy',
      'Done': '✅ Done',
    };
    return labels[status] || status;
  }

  /**
   * Determine primary status for a module based on counts
   */
  getPrimaryStatus(task) {
    if (task.onProgress > 0) return 'On Progress';
    if (task.readyToTest > 0) return 'Ready to Test';
    if (task.onTesting > 0) return 'On Testing';
    if (task.readyToDeploy > 0) return 'Ready to Deploy';
    if (task.done > 0) return 'Done';
    return '';
  }

  generate() {
    const dateStr = new Date().toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let report = `📊 *WEEKLY PM REPORT*\n`;
    report += `_${dateStr}_\n`;
    if (this.dateRange) {
      report += `_Periode: ${this.dateRange}_\n`;
    }
    report += `\n`;

    // Group tasks by app
    const byApp = {};
    this.tasks.forEach(task => {
      if (!byApp[task.app]) byApp[task.app] = [];
      byApp[task.app].push(task);
    });

    // Sort apps by total tasks
    const sortedApps = Object.entries(byApp)
      .map(([app, modules]) => ({
        app,
        modules,
        totalTasks: modules.reduce((sum, m) => sum + m.total, 0)
      }))
      .sort((a, b) => b.totalTasks - a.totalTasks);

    if (sortedApps.length === 0) {
      report += `_Tidak ada task baru minggu ini._\n`;
      return report;
    }

    // Generate report per app
    sortedApps.forEach(({ app, modules, totalTasks }) => {
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📱 *${app}* (${totalTasks} task${totalTasks > 1 ? 's' : ''})\n`;
      
      // Sort modules by total
      modules.sort((a, b) => b.total - a.total);
      
      modules.forEach((mod, idx) => {
        const isLast = idx === modules.length - 1;
        const prefix = isLast ? '└─' : '├─';
        const status = this.getPrimaryStatus(mod);
        const statusLabel = status ? ` - ${status}` : '';
        
        report += `${prefix} ${mod.module}${statusLabel}\n`;
        
        // Get task details for this module
        const key = `${app}|${mod.module}`;
        const details = this.taskDetails[key] || [];
        
        // Show task IDs - limit to module's actual new task count
        const maxTasks = mod.total || 1;
        
        // First try to match by status, then fallback to any task in module
        let relevantTasks = details.filter(t => t.status === status).slice(0, maxTasks);
        if (relevantTasks.length === 0 && details.length > 0) {
          relevantTasks = details.slice(0, maxTasks);
        }
        
        if (relevantTasks.length > 0) {
          const innerPrefix = isLast ? '   ' : '│  ';
          relevantTasks.forEach(t => {
            const doneMarker = t.resolved ? ' ✓' : '';
            // Show overdue indicator and deadline
            let deadlineStr = '';
            if (t.deadline) {
              const dl = t.deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
              if (t.isOverdue) {
                deadlineStr = ` ⚠️ *OVERDUE* (${dl})`;
              } else {
                deadlineStr = ` 📅 ${dl}`;
              }
            }
            report += `${innerPrefix}• [${t.id}] ${t.desc}${doneMarker}${deadlineStr}\n`;
          });
        }
      });
      
      report += `\n`;
    });

    // Collect overdue tasks (only from NEW tasks this week, not all history)
    const overdueTasks = [];
    const newTaskKeys = new Set(this.tasks.map(t => `${t.app}|${t.module}`));
    
    Object.entries(this.taskDetails).forEach(([key, tasks]) => {
      // Only check modules that have new tasks this week
      if (!newTaskKeys.has(key)) return;
      
      tasks.forEach(t => {
        if (t.isOverdue && !t.resolved) {
          const [app, module] = key.split('|');
          overdueTasks.push({ ...t, app, module });
        }
      });
    });

    // Summary
    const totalTasks = this.tasks.reduce((sum, t) => sum + t.total, 0);
    const totalProgress = this.tasks.reduce((sum, t) => sum + t.onProgress, 0);
    const totalTest = this.tasks.reduce((sum, t) => sum + t.readyToTest, 0);
    const totalTesting = this.tasks.reduce((sum, t) => sum + t.onTesting, 0);
    const totalDeploy = this.tasks.reduce((sum, t) => sum + t.readyToDeploy, 0);

    report += `━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📈 *TOTAL: ${totalTasks} task baru*\n`;
    if (totalProgress > 0) report += `• On Progress: ${totalProgress}\n`;
    if (totalTest > 0) report += `• Ready to Test: ${totalTest}\n`;
    if (totalTesting > 0) report += `• On Testing: ${totalTesting}\n`;
    if (totalDeploy > 0) report += `• Ready to Deploy: ${totalDeploy}\n`;

    // Overdue section (only show recent ones - max 3 per app)
    if (overdueTasks.length > 0) {
      // Sort by deadline (most recent first)
      overdueTasks.sort((a, b) => b.deadline - a.deadline);
      
      report += `\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `⚠️ *OVERDUE TASKS* (${overdueTasks.length} total)\n\n`;
      
      // Group by app
      const byApp = {};
      overdueTasks.forEach(t => {
        if (!byApp[t.app]) byApp[t.app] = [];
        byApp[t.app].push(t);
      });
      
      Object.entries(byApp).forEach(([app, tasks]) => {
        report += `📱 *${app}* (${tasks.length} overdue)\n`;
        // Show max 3 per app (most recent first)
        tasks.slice(0, 3).forEach(t => {
          const dl = t.deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          report += `• [${t.id}] ${t.desc} - deadline ${dl}\n`;
        });
        if (tasks.length > 3) {
          report += `  _...dan ${tasks.length - 3} task lainnya_\n`;
        }
        report += `\n`;
      });
    } else {
      report += `\n✅ _Tidak ada task overdue._\n`;
    }

    // Add status changes section if any
    if (this.statusChanges.length > 0) {
      report += `\n`;
      report += `━━━━━━━━━━━━━━━━━━━━\n`;
      report += `🔄 *STATUS CHANGES* (${this.statusChanges.length})\n\n`;
      
      // Group by app -> module
      const byApp = {};
      this.statusChanges.forEach(ch => {
        if (!byApp[ch.app]) byApp[ch.app] = {};
        const mod = ch.module || 'Other';
        if (!byApp[ch.app][mod]) byApp[ch.app][mod] = [];
        byApp[ch.app][mod].push(ch);
      });
      
      // Sort apps by total changes
      const sortedApps = Object.entries(byApp)
        .map(([app, modules]) => ({
          app,
          modules,
          total: Object.values(modules).flat().length
        }))
        .sort((a, b) => b.total - a.total);
      
      sortedApps.forEach(({ app, modules, total }) => {
        report += `📱 *${app}* (${total} changes)\n`;
        
        const moduleEntries = Object.entries(modules);
        moduleEntries.forEach(([mod, changes], idx) => {
          const isLast = idx === moduleEntries.length - 1;
          const prefix = isLast ? '└─' : '├─';
          report += `${prefix} ${mod}\n`;
          
          const innerPrefix = isLast ? '   ' : '│  ';
          changes.forEach(ch => {
            report += `${innerPrefix}• [${ch.id}] ${ch.oldStatus} → ${ch.newStatus}\n`;
          });
        });
        report += `\n`;
      });
    }

    return report;
  }
}

module.exports = ReportGenerator;
