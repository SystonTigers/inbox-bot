var InboxBot = InboxBot || {};

InboxBot.UI = (function (Config, Utils) {
  function onOpen() {
    try {
      buildMenu();
    } catch (err) {
      // Spreadsheet may not be active in headless contexts.
    }
  }

  function buildMenu() {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('Inbox Bot')
      .addItem('Run Dry-Run Backfill', 'runDryRunBackfill')
      .addItem('Run Live Backfill', 'runLiveBackfill')
      .addItem('Process New Mail', 'processNewMail')
      .addItem('Process New Mail (Dry-Run)', 'processNewMailDryRun')
      .addItem('Review Unsubscribes', 'reviewUnsubs')
      .addItem('Undo last N actions', 'undoLastActions')
      .addSeparator()
      .addItem('Install Triggers', 'installInboxBotTriggers')
      .addItem('Open Dashboard', 'openDashboard')
      .addItem('Bootstrap Sheets', 'bootstrapInboxBotSheets')
      .addItem('Queue Reply Drafts (Needs Approval)', 'queueRepliesForApproval')
      .addItem('Send Approved Drafts', 'sendApprovedDrafts')
      .addItem('Discard Rejected Drafts', 'discardRejectedDrafts')
      .addToUi();
  }

  function installRecommendedTriggers() {
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function (trigger) {
      var handler = trigger.getHandlerFunction();
      if (handler === 'processNewMail' ||
          handler === 'runLiveBackfill' ||
          handler === 'sendInboxBotDailySummary' ||
          handler === 'runInboxBotWeeklyMaintenance') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    ScriptApp.newTrigger('processNewMail')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .create();
    ScriptApp.newTrigger('processNewMail')
      .timeBased()
      .everyHours(1)
      .create();
    ScriptApp.newTrigger('sendInboxBotDailySummary')
      .timeBased()
      .atHour(21)
      .everyDays(1)
      .create();
    ScriptApp.newTrigger('runInboxBotWeeklyMaintenance')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(7)
      .create();
  }

  function openUnsubscribeQueue() {
    var config = Config.loadConfig();
    var sheet = config.sheets.unsub;
    if (sheet) {
      config.ss.setActiveSheet(sheet);
    }
  }

  function openDashboard() {
    var config = Config.loadConfig();
    var sheet = config.sheets.dashboard;
    if (sheet) {
      config.ss.setActiveSheet(sheet);
    }
  }

  function promptUndoActions() {
    var ui = SpreadsheetApp.getUi();
    var response = ui.prompt('Undo actions', 'Enter how many recent actions to revert:', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) {
      return;
    }
    var value = parseInt(response.getResponseText(), 10);
    if (!value || value <= 0) {
      ui.alert('Invalid number');
      return;
    }
    var config = Config.loadConfig();
    var undone = InboxBot.Logging.undoLastActions(value, config);
    ui.alert('Undo complete', 'Reverted ' + undone + ' actions.', ui.ButtonSet.OK);
  }

  function updateDashboard(config, stats, run) {
    var sheet = config.sheets.dashboard;
    if (!sheet) {
      return;
    }
    sheet.clear();
    var snapshot = InboxBot.Logging.getDashboardSnapshot();
    var progress = stats.progress || {};
    var remainingDisplay = progress.remaining != null ? progress.remaining : 'Unknown';
    var totalDisplay = progress.total != null ? progress.total : 'Unknown';
    var etaDisplay = 'Estimating';
    if (progress.complete || progress.remaining === 0) {
      etaDisplay = 'Complete';
    } else if (stats.processed > 0) {
      etaDisplay = 'In progress';
    }
    var summaryValues = [
      ['Run Summary', 'Value'],
      ['Run ID', run.runId],
      ['Operation', run.mode],
      ['Mode', run.dryRun ? 'DRYRUN' : 'LIVE'],
      ['Processed (this run)', stats.processed || 0],
      ['Archived (this run)', stats.archived || 0],
      ['Errors (this run)', stats.errors || 0],
      ['Window Start', stats.windowStart ? stats.windowStart : ''],
      ['Window End', stats.windowEnd ? stats.windowEnd : ''],
      ['Total (est)', totalDisplay],
      ['Remaining (est)', remainingDisplay],
      ['ETA', etaDisplay],
      ['Generated', Utils.timestamp()],
    ];
    sheet.getRange(1, 1, summaryValues.length, 2).setValues(summaryValues);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');

    var metricsTable = [
      ['Metric', 'Today', '7d', '30d'],
      ['Processed', snapshot.day.processed, snapshot.week.processed, snapshot.month.processed],
      ['Archived', snapshot.day.archived, snapshot.week.archived, snapshot.month.archived],
      ['Errors', snapshot.day.errors, snapshot.week.errors, snapshot.month.errors],
    ];
    sheet.getRange(1, 4, metricsTable.length, metricsTable[0].length).setValues(metricsTable);
    sheet.getRange(1, 4, 1, metricsTable[0].length).setFontWeight('bold');

    var categoryRows = [['Category', 'Current Run Count']];
    Object.keys(stats.categoryCounts).sort(function (a, b) {
      return (stats.categoryCounts[b] || 0) - (stats.categoryCounts[a] || 0);
    }).forEach(function (category) {
      categoryRows.push([category, stats.categoryCounts[category]]);
    });
    sheet.getRange(12, 1, categoryRows.length, 2).setValues(categoryRows);
    sheet.getRange(12, 1).setFontWeight('bold');

    var monthlyCategories = [['Category', '30d Count']];
    Object.keys(snapshot.month.categories || {}).sort(function (a, b) {
      return (snapshot.month.categories[b] || 0) - (snapshot.month.categories[a] || 0);
    }).forEach(function (category) {
      monthlyCategories.push([category, snapshot.month.categories[category]]);
    });
    sheet.getRange(12, 3, monthlyCategories.length, 2).setValues(monthlyCategories);
    sheet.getRange(12, 3).setFontWeight('bold');

    var senderRows = [['Sender', '30d Count']];
    var senderCounts = snapshot.month.senders || {};
    Object.keys(senderCounts).sort(function (a, b) {
      return senderCounts[b] - senderCounts[a];
    }).slice(0, 20).forEach(function (sender) {
      senderRows.push([sender, senderCounts[sender]]);
    });
    sheet.getRange(12, 5, senderRows.length, 2).setValues(senderRows);
    sheet.getRange(12, 5).setFontWeight('bold');
  }

  function refreshDashboardSnapshot(config) {
    var stats = {
      processed: 0,
      archived: 0,
      errors: 0,
      categoryCounts: {},
      senderCounts: {},
      windowStart: '',
      windowEnd: '',
    };
    var run = {
      runId: 'SNAPSHOT',
      mode: 'SNAPSHOT',
      dryRun: true,
    };
    updateDashboard(config, stats, run);
  }

  return {
    onOpen: onOpen,
    installRecommendedTriggers: installRecommendedTriggers,
    openUnsubscribeQueue: openUnsubscribeQueue,
    openDashboard: openDashboard,
    promptUndoActions: promptUndoActions,
    updateDashboard: updateDashboard,
    refreshDashboardSnapshot: refreshDashboardSnapshot,
  };
})(InboxBot.Config, InboxBot.Utils);
