var InboxBot = InboxBot || {};

InboxBot.Logging = (function (Utils, Config) {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();
  var USER_PROP = PropertiesService.getUserProperties();
  var RUN_CONTEXT_KEY = 'INBOX_BOT_LAST_RUN';
  var ACTION_STACK_KEY = 'INBOX_BOT_ACTION_STACK';
  var DAY_STATS_KEY = 'INBOX_BOT_DAY_STATS';

  var LOG_HEADERS = [
    'timestamp',
    'mode',
    'operation',
    'rule',
    'processed',
    'archived',
    'errors',
    'batchId',
  ];

  function getLogSheet(config) {
    var sheet = config.sheets && config.sheets.log;
    if (!sheet) {
      var ss = Config.getControlSpreadsheet();
      sheet = ss.getSheetByName(Config.constants.LOG_SHEET);
    }
    if (!sheet) {
      throw new Error('LOG sheet missing; run bootstrap.');
    }
    Utils.assertSheetHeaders(sheet, LOG_HEADERS);
    return sheet;
  }

  function startRun(config, metadata) {
    var run = {
      runId: Utilities.getUuid(),
      startedAt: Utils.timestamp(),
      dryRun: !!metadata.dryRun,
      mode: metadata.mode || 'UNKNOWN',
      batches: 0,
      processed: 0,
      archived: 0,
      errors: 0,
    };
    SCRIPT_PROP.setProperty(RUN_CONTEXT_KEY, JSON.stringify(run));
    return run;
  }

  function incrementRunCounters(run, delta) {
    if (!run) {
      return;
    }
    if (typeof delta.processed === 'number') {
      run.processed += delta.processed;
    }
    if (typeof delta.archived === 'number') {
      run.archived += delta.archived;
    }
    if (typeof delta.batches === 'number') {
      run.batches += delta.batches;
    }
    if (typeof delta.errors === 'number') {
      run.errors += delta.errors;
    }
    SCRIPT_PROP.setProperty(RUN_CONTEXT_KEY, JSON.stringify(run));
  }

  function endRun(run) {
    if (!run) {
      return;
    }
    run.endedAt = Utils.timestamp();
    SCRIPT_PROP.setProperty(RUN_CONTEXT_KEY, JSON.stringify(run));
  }

  function pushActionForUndo(actionPayload, run) {
    if (run && run.dryRun) {
      return;
    }
    var json = USER_PROP.getProperty(ACTION_STACK_KEY);
    var stack = Utils.safeParseJson(json, []);
    stack.push(actionPayload);
    if (stack.length > 500) {
      stack = stack.slice(stack.length - 500);
    }
    USER_PROP.setProperty(ACTION_STACK_KEY, JSON.stringify(stack));
  }

  function popRecentActions(count) {
    var json = USER_PROP.getProperty(ACTION_STACK_KEY);
    if (!json) {
      return [];
    }
    var stack = Utils.safeParseJson(json, []);
    var popped = [];
    while (count > 0 && stack.length > 0) {
      popped.push(stack.pop());
      count--;
    }
    USER_PROP.setProperty(ACTION_STACK_KEY, JSON.stringify(stack));
    return popped;
  }

  function logAction(config, run, payload) {
    var sheet = getLogSheet(config);
    sheet.appendRow([
      Utils.timestamp(),
      run.dryRun ? 'DRYRUN' : 'LIVE',
      run.mode,
      payload.ruleName || payload.reason || '',
      1,
      payload.archived ? 1 : 0,
      0,
      run.runId,
    ]);
    pushActionForUndo({
      messageId: payload.messageId,
      threadId: payload.threadId,
      oldLabels: payload.oldLabels || [],
      newLabels: payload.newLabels || [],
      starred: payload.starred || false,
      unstarred: payload.unstarred || false,
      markRead: payload.markRead || false,
      markUnread: payload.markUnread || false,
      archived: payload.archived || false,
      actions: payload.actions || [],
      category: payload.category || '',
    }, run);
  }

  function logError(config, run, error, context) {
    var sheet = getLogSheet(config);
    sheet.appendRow([
      Utils.timestamp(),
      run && run.dryRun ? 'DRYRUN' : 'LIVE',
      run ? run.mode : 'UNKNOWN',
      context && context.reason ? context.reason : 'Error',
      0,
      0,
      Utils.summarizeError(error),
      run ? run.runId : '',
    ]);
    if (run) {
      incrementRunCounters(run, { errors: 1 });
    }
  }

  function undoLastActions(count, config) {
    var undone = 0;
    var actions = popRecentActions(count);
    actions.forEach(function (payload) {
      try {
        InboxBot.Actions.undoAction(payload, config);
        undone++;
      } catch (err) {
        logError(config, null, err, {
          threadId: payload.threadId,
          reason: 'Undo failure',
        });
      }
    });
    return undone;
  }

  function recordRunSummary(stats) {
    var json = SCRIPT_PROP.getProperty(DAY_STATS_KEY);
    var entries = Utils.safeParseJson(json, []);
    var todayKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].date === todayKey) {
        entry = entries[i];
        break;
      }
    }
    if (!entry) {
      entry = {
        date: todayKey,
        processed: 0,
        archived: 0,
        errors: 0,
        categories: {},
        senders: {},
      };
      entries.push(entry);
    }
    entry.processed += stats.processed || 0;
    entry.archived += stats.archived || 0;
    entry.errors += stats.errors || 0;
    Object.keys(stats.categoryCounts || {}).forEach(function (category) {
      entry.categories[category] = (entry.categories[category] || 0) + stats.categoryCounts[category];
    });
    Object.keys(stats.senderCounts || {}).forEach(function (sender) {
      entry.senders[sender] = (entry.senders[sender] || 0) + stats.senderCounts[sender];
    });
    entry.categories = trimCounts(entry.categories, 50);
    entry.senders = trimCounts(entry.senders, 200);
    entries = entries.sort(function (a, b) {
      return a.date < b.date ? -1 : 1;
    });
    if (entries.length > 120) {
      entries = entries.slice(entries.length - 120);
    }
    SCRIPT_PROP.setProperty(DAY_STATS_KEY, JSON.stringify(entries));
  }

  function aggregateStats(days) {
    var json = SCRIPT_PROP.getProperty(DAY_STATS_KEY);
    var entries = Utils.safeParseJson(json, []);
    var cutoff = Utils.dateDaysAgo(days - 1);
    cutoff.setHours(0, 0, 0, 0);
    var aggregate = {
      processed: 0,
      archived: 0,
      errors: 0,
      categories: {},
      senders: {},
    };
    entries.forEach(function (entry) {
      var entryDate = new Date(entry.date + 'T00:00:00');
      if (entryDate < cutoff) {
        return;
      }
      aggregate.processed += entry.processed || 0;
      aggregate.archived += entry.archived || 0;
      aggregate.errors += entry.errors || 0;
      Object.keys(entry.categories || {}).forEach(function (category) {
        aggregate.categories[category] = (aggregate.categories[category] || 0) + entry.categories[category];
      });
      Object.keys(entry.senders || {}).forEach(function (sender) {
        aggregate.senders[sender] = (aggregate.senders[sender] || 0) + entry.senders[sender];
      });
    });
    aggregate.categories = trimCounts(aggregate.categories, 50);
    aggregate.senders = trimCounts(aggregate.senders, 200);
    return aggregate;
  }

  function trimCounts(counts, limit) {
    var keys = Object.keys(counts || {});
    if (keys.length <= limit) {
      return counts;
    }
    keys.sort(function (a, b) {
      return counts[b] - counts[a];
    });
    var trimmed = {};
    for (var i = 0; i < Math.min(limit, keys.length); i++) {
      trimmed[keys[i]] = counts[keys[i]];
    }
    return trimmed;
  }

  function sendDailySummary(config) {
    var daily = aggregateStats(1);
    var lines = [
      'Inbox Bot Daily Summary',
      'Processed: ' + daily.processed,
      'Archived: ' + daily.archived,
      'Errors: ' + daily.errors,
      '',
      'Top Categories:',
    ];
    Object.keys(daily.categories).sort(function (a, b) {
      return daily.categories[b] - daily.categories[a];
    }).slice(0, 10).forEach(function (category) {
      lines.push('- ' + category + ': ' + daily.categories[category]);
    });
    lines.push('');
    lines.push('Top Senders:');
    Object.keys(daily.senders).sort(function (a, b) {
      return daily.senders[b] - daily.senders[a];
    }).slice(0, 10).forEach(function (sender) {
      lines.push('- ' + sender + ': ' + daily.senders[sender]);
    });
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: 'Inbox Bot Daily Summary',
      body: lines.join('\n'),
    });
  }

  function sendWeeklyDigest(config) {
    var weekly = aggregateStats(7);
    var lines = [
      'Inbox Bot Weekly Digest',
      'Processed (7d): ' + weekly.processed,
      'Archived (7d): ' + weekly.archived,
      'Errors (7d): ' + weekly.errors,
      '',
      'Top Categories (7d):',
    ];
    Object.keys(weekly.categories).sort(function (a, b) {
      return weekly.categories[b] - weekly.categories[a];
    }).slice(0, 10).forEach(function (category) {
      lines.push('- ' + category + ': ' + weekly.categories[category]);
    });
    lines.push('');
    lines.push('Top Senders (7d):');
    Object.keys(weekly.senders).sort(function (a, b) {
      return weekly.senders[b] - weekly.senders[a];
    }).slice(0, 10).forEach(function (sender) {
      lines.push('- ' + sender + ': ' + weekly.senders[sender]);
    });
    lines.push('');
    lines.push('Pending Unsubscribes:');
    var unsubSheet = config.sheets && config.sheets.unsub;
    if (!unsubSheet) {
      unsubSheet = Config.getControlSpreadsheet().getSheetByName(Config.constants.UNSUB_SHEET);
    }
    if (unsubSheet) {
      var values = unsubSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if ((values[i][3] || '').toUpperCase() === 'NEW') {
          lines.push('- ' + values[i][0] + ' -> ' + values[i][2]);
        }
      }
    }
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: 'Inbox Bot Weekly Digest',
      body: lines.join('\n'),
    });
  }

  function getDashboardSnapshot() {
    return {
      day: aggregateStats(1),
      week: aggregateStats(7),
      month: aggregateStats(30),
    };
  }

  function logOperation(config, operation, details) {
    details = details || {};
    var sheet = getLogSheet(config);
    sheet.appendRow([
      Utils.timestamp(),
      config.dryRun ? 'DRYRUN' : 'LIVE',
      operation,
      details.rule || '',
      details.processed != null ? details.processed : 0,
      details.archived != null ? details.archived : 0,
      details.errors != null ? details.errors : '',
      details.batchId || '',
    ]);
  }

  return {
    startRun: startRun,
    endRun: endRun,
    incrementRunCounters: incrementRunCounters,
    logAction: logAction,
    logError: logError,
    undoLastActions: undoLastActions,
    recordRunSummary: recordRunSummary,
    sendDailySummary: sendDailySummary,
    sendWeeklyDigest: sendWeeklyDigest,
    getDashboardSnapshot: getDashboardSnapshot,
    logOperation: logOperation,
    constants: {
      LOG_HEADERS: LOG_HEADERS,
    },
  };
})(InboxBot.Utils, InboxBot.Config);
