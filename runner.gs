var InboxBot = InboxBot || {};

InboxBot.Runner = (function (Utils, Config) {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();

  function updateBackfillProgress(processedIncrement, totalEstimate, complete) {
    var processed = Number(SCRIPT_PROP.getProperty('INBOX_BOT_BACKFILL_PROCESSED') || '0');
    processed += processedIncrement || 0;
    SCRIPT_PROP.setProperty('INBOX_BOT_BACKFILL_PROCESSED', String(processed));
    if (typeof totalEstimate === 'number') {
      SCRIPT_PROP.setProperty('INBOX_BOT_BACKFILL_TOTAL', String(totalEstimate));
    }
    if (complete) {
      SCRIPT_PROP.setProperty('INBOX_BOT_BACKFILL_COMPLETED_AT', Utils.timestamp());
    }
    var total = Number(SCRIPT_PROP.getProperty('INBOX_BOT_BACKFILL_TOTAL') || '0') || null;
    var remaining = null;
    if (total !== null) {
      remaining = Math.max(total - processed, 0);
    }
    return {
      type: 'BACKFILL',
      processed: processed,
      total: total,
      remaining: remaining,
      complete: !!complete,
      completedAt: complete ? Utils.timestamp() : null,
    };
  }

  function getBackfillProgressSnapshot() {
    var processed = Number(SCRIPT_PROP.getProperty('INBOX_BOT_BACKFILL_PROCESSED') || '0');
    var total = Number(SCRIPT_PROP.getProperty('INBOX_BOT_BACKFILL_TOTAL') || '0') || null;
    var remaining = null;
    if (total !== null) {
      remaining = Math.max(total - processed, 0);
    }
    return {
      type: 'BACKFILL',
      processed: processed,
      total: total,
      remaining: remaining,
      complete: remaining === 0 && total !== null,
      completedAt: SCRIPT_PROP.getProperty('INBOX_BOT_BACKFILL_COMPLETED_AT'),
    };
  }

  function runPipeline(options) {
    options = options || {};
    var config = Config.loadConfig();
    if (options.dryRun !== undefined) {
      config.dryRun = options.dryRun;
    }
    var run = InboxBot.Logging.startRun(config, {
      dryRun: config.dryRun,
      mode: options.mode,
    });
    var start = new Date().getTime();
    var maxRuntime = (config.maxRuntimeMin || 5) * 60 * 1000;
    var fetchResult = fetchBatch(options.mode, config);
    var threads = fetchResult.threads || [];
    var stats = {
      processed: 0,
      categoryCounts: {},
      senderCounts: {},
      errors: 0,
      archived: 0,
      windowStart: fetchResult.windowStart,
      windowEnd: fetchResult.windowEnd,
      progress: options.mode === 'BACKFILL' ? getBackfillProgressSnapshot() : null,
    };
    var processedIds = {};

    for (var i = 0; i < threads.length; i++) {
      if (new Date().getTime() - start > maxRuntime) {
        break;
      }
      var thread = threads[i];
      if (!thread) {
        continue;
      }
      var threadId = thread.getId();
      if (processedIds[threadId]) {
        continue;
      }
      processedIds[threadId] = true;
      try {
        processThread(thread, config, run, stats);
        stats.processed++;
        InboxBot.Logging.incrementRunCounters(run, {
          processed: 1,
        });
        Utilities.sleep(100);
      } catch (err) {
        stats.errors++;
        InboxBot.Logging.logError(config, run, err, {
          threadId: threadId,
          actions: ['PROCESS'],
          reason: 'Pipeline failure',
        });
        Utilities.sleep(250);
      }
    }

    run.processed = stats.processed;
    run.archived = stats.archived;
    run.errors = stats.errors;
    run.windowStart = stats.windowStart ? stats.windowStart.toISOString ? stats.windowStart.toISOString() : stats.windowStart : null;
    run.windowEnd = stats.windowEnd ? stats.windowEnd.toISOString ? stats.windowEnd.toISOString() : stats.windowEnd : null;
    if (options.mode === 'BACKFILL') {
      stats.progress = updateBackfillProgress(stats.processed, fetchResult.totalEstimate, fetchResult.cursor && fetchResult.cursor.complete);
    } else if (!stats.progress) {
      stats.progress = {
        type: 'INCREMENTAL',
        processed: stats.processed,
        windowStart: stats.windowStart,
        windowEnd: stats.windowEnd,
      };
    }
    InboxBot.Logging.recordRunSummary(stats);
    InboxBot.Logging.endRun(run);
    InboxBot.UI.updateDashboard(config, stats, run);
  }

  function fetchBatch(mode, config) {
    if (mode === 'BACKFILL') {
      return InboxBot.Backfill.fetchNextBatch(config);
    }
    return InboxBot.Incremental.fetchNextBatch(config);
  }

  function processThread(thread, config, run, stats) {
    var classification = InboxBot.Rules.classifyThread(thread, config);
    var actionResult = InboxBot.Actions.enact(thread, classification, config, run);
    var metadata = classification.metadata;
    var logPayload = {
      threadId: thread.getId(),
      messageId: classification.messageId,
      subject: metadata.subject,
      category: classification.category,
      actions: actionResult.actions,
      score: classification.score,
      reason: classification.reason,
      ruleName: classification.ruleName,
      oldLabels: actionResult.oldLabels,
      newLabels: actionResult.newLabels,
      notes: actionResult.notes.join('; '),
      starred: actionResult.starred,
      markRead: actionResult.markRead,
      archived: actionResult.archived,
    };
    InboxBot.Logging.logAction(config, run, logPayload);
    var categoryKey = classification.category || 'Other/Uncategorized';
    stats.categoryCounts[categoryKey] = (stats.categoryCounts[categoryKey] || 0) + 1;
    var senderKey = (metadata.fromAddress || metadata.from || 'unknown').toLowerCase();
    stats.senderCounts[senderKey] = (stats.senderCounts[senderKey] || 0) + 1;
    if (actionResult.archived) {
      stats.archived += 1;
      InboxBot.Logging.incrementRunCounters(run, { archived: 1 });
    }
    if (config.enableUnsub &&
        metadata.senderHandling !== 'NEVER_UNSUB' &&
        (classification.category === 'Newsletters/Marketing' || classification.category === 'Social/Notifications')) {
      InboxBot.Unsubscribe.queue(metadata, config, classification.reason);
    }
  }

  return {
    runPipeline: runPipeline,
  };
})(InboxBot.Utils, InboxBot.Config);
