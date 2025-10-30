var InboxBot = InboxBot || {};

/**
 * Top-level entrypoints exposed for menus, triggers, and clasp deployment.
 */
InboxBot.EntryPoints = (function () {
  /**
   * Execute a backfill in dry-run mode.
   */
  function runDryRunBackfill() {
    InboxBot.Runner.runPipeline({
      mode: 'BACKFILL',
      dryRun: true,
      resume: true,
    });
  }

  /**
   * Execute a backfill that performs live actions.
   */
  function runLiveBackfill() {
    InboxBot.Runner.runPipeline({
      mode: 'BACKFILL',
      dryRun: false,
      resume: true,
    });
  }

  /**
   * Process recent changes incrementally.
   */
  function processIncremental() {
    InboxBot.Runner.runPipeline({
      mode: 'INCREMENTAL',
      dryRun: false,
      resume: true,
    });
  }

  /**
   * Process recent changes incrementally in dry-run.
   */
  function processIncrementalDryRun() {
    InboxBot.Runner.runPipeline({
      mode: 'INCREMENTAL',
      dryRun: true,
      resume: true,
    });
  }

  /**
   * Install the recommended timed triggers.
   */
  function installTriggers() {
    InboxBot.UI.installRecommendedTriggers();
  }

  /**
   * Surface the unsubscribe review sheet.
   */
  function reviewUnsubscribes() {
    InboxBot.UI.openUnsubscribeQueue();
  }

  /**
   * Undo the most recent N actions, prompting the user for N.
   */
  function undoLastNActions() {
    InboxBot.UI.promptUndoActions();
  }

  /**
   * Open the dashboard sheet for quick access.
   */
  function openDashboard() {
    InboxBot.UI.openDashboard();
  }

  /**
   * Execute the bootstrap routine that prepares the Sheets workspace.
   */
  function bootstrapSheets() {
    InboxBot.Bootstrap.ensureSheets();
  }

  /**
   * Send the daily summary manually.
   */
  function sendDailySummary() {
    var config = InboxBot.Config.loadConfig();
    InboxBot.Logging.sendDailySummary(config);
  }

  /**
   * Send the weekly digest and suggested unsubscribes.
   */
  function sendWeeklyDigest() {
    var config = InboxBot.Config.loadConfig();
    InboxBot.Logging.sendWeeklyDigest(config);
  }

  /**
   * Refresh dashboard from aggregated snapshot.
   */
  function refreshDashboardSnapshot() {
    var config = InboxBot.Config.loadConfig();
    InboxBot.UI.refreshDashboardSnapshot(config);
  }

  /**
   * Reset backfill cursor (helper).
   */
  function resetBackfillCursor() {
    InboxBot.Backfill.resetCursor();
  }

  /**
   * Reset incremental cursor (helper).
   */
  function resetIncrementalCursor() {
    InboxBot.Incremental.resetCursor();
  }

  /**
   * Weekly maintenance helper: refresh dashboard + send digest.
   */
  function runWeeklyMaintenance() {
    var config = InboxBot.Config.loadConfig();
    InboxBot.UI.refreshDashboardSnapshot(config);
    InboxBot.Logging.sendWeeklyDigest(config);
  }

  /**
   * Queue reply drafts needing approval.
   */
  function queueRepliesForApproval() {
    InboxBot.ReplyAssistant.queueForApproval();
  }

  /**
   * Send drafts that have been approved.
   */
  function sendApprovedDrafts() {
    InboxBot.ReplyAssistant.sendApprovedDrafts();
  }

  /**
   * Discard drafts that have been rejected.
   */
  function discardRejectedDrafts() {
    InboxBot.ReplyAssistant.discardRejectedDrafts();
  }

  return {
    runDryRunBackfill: runDryRunBackfill,
    runLiveBackfill: runLiveBackfill,
    processIncremental: processIncremental,
    processIncrementalDryRun: processIncrementalDryRun,
    installTriggers: installTriggers,
    reviewUnsubscribes: reviewUnsubscribes,
    undoLastNActions: undoLastNActions,
    openDashboard: openDashboard,
    bootstrapSheets: bootstrapSheets,
    sendDailySummary: sendDailySummary,
    sendWeeklyDigest: sendWeeklyDigest,
    refreshDashboardSnapshot: refreshDashboardSnapshot,
    resetBackfillCursor: resetBackfillCursor,
    resetIncrementalCursor: resetIncrementalCursor,
    runWeeklyMaintenance: runWeeklyMaintenance,
    queueRepliesForApproval: queueRepliesForApproval,
    sendApprovedDrafts: sendApprovedDrafts,
    discardRejectedDrafts: discardRejectedDrafts,
  };
})();

/**
 * GAS automatically invokes this on spreadsheet open.
 */
function onOpen() {
  InboxBot.UI.onOpen();
}

/**
 * Exposed global functions for Apps Script menus & triggers.
 */
function runDryRunBackfill() {
  InboxBot.EntryPoints.runDryRunBackfill();
}

function runLiveBackfill() {
  InboxBot.EntryPoints.runLiveBackfill();
}

function processNewMail() {
  InboxBot.EntryPoints.processIncremental();
}

function processNewMailDryRun() {
  InboxBot.EntryPoints.processIncrementalDryRun();
}

function reviewUnsubs() {
  InboxBot.EntryPoints.reviewUnsubscribes();
}

function undoLastActions() {
  InboxBot.EntryPoints.undoLastNActions();
}

function installInboxBotTriggers() {
  InboxBot.EntryPoints.installTriggers();
}

function openDashboard() {
  InboxBot.EntryPoints.openDashboard();
}

function bootstrapInboxBotSheets() {
  InboxBot.EntryPoints.bootstrapSheets();
}

function sendInboxBotDailySummary() {
  InboxBot.EntryPoints.sendDailySummary();
}

function sendInboxBotWeeklyDigest() {
  InboxBot.EntryPoints.sendWeeklyDigest();
}

function refreshInboxBotDashboardSnapshot() {
  InboxBot.EntryPoints.refreshDashboardSnapshot();
}

function resetInboxBotBackfillCursor() {
  InboxBot.EntryPoints.resetBackfillCursor();
}

function resetInboxBotIncrementalCursor() {
  InboxBot.EntryPoints.resetIncrementalCursor();
}

function runInboxBotWeeklyMaintenance() {
  InboxBot.EntryPoints.runWeeklyMaintenance();
}

function queueRepliesForApproval() {
  InboxBot.EntryPoints.queueRepliesForApproval();
}

function sendApprovedDrafts() {
  InboxBot.EntryPoints.sendApprovedDrafts();
}

function discardRejectedDrafts() {
  InboxBot.EntryPoints.discardRejectedDrafts();
}
