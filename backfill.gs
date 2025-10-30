var InboxBot = InboxBot || {};

InboxBot.Backfill = (function (Utils) {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();
  var CURSOR_KEY = 'INBOX_BOT_BACKFILL_CURSOR';

  function getCursor() {
    var json = SCRIPT_PROP.getProperty(CURSOR_KEY);
    if (!json) {
      return {
        windowDays: 7,
        nextDate: '2006-01-01',
        complete: false,
      };
    }
    try {
      return JSON.parse(json);
    } catch (err) {
      return {
        windowDays: 7,
        nextDate: '2006-01-01',
        complete: false,
      };
    }
  }

  function saveCursor(cursor) {
    SCRIPT_PROP.setProperty(CURSOR_KEY, JSON.stringify(cursor));
  }

  function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  }

  function fetchNextBatch(config) {
    var cursor = getCursor();
    var now = new Date();
    if (cursor.complete) {
      return { threads: [], cursor: cursor };
    }
    var start = cursor.nextDate ? new Date(cursor.nextDate) : new Date('2006-01-01');
    var windowDays = cursor.windowDays || 7;
    var end = new Date(start.getTime());
    end.setDate(end.getDate() + windowDays);
    if (end > now) {
      end = now;
      cursor.complete = true;
    }
    var query = [
      'after:' + formatDate(start),
      'before:' + formatDate(end),
      '-label:trash',
      '-label:spam',
    ].join(' ');
    var threads = GmailApp.search(query, 0, config.batchSize || 50);
    threads = threads.reverse();
    var totalEstimate = null;
    try {
      var response = Gmail.Users.Threads.list('me', { q: query, maxResults: 1, includeSpamTrash: false });
      if (response && typeof response.resultSizeEstimate === 'number') {
        totalEstimate = response.resultSizeEstimate;
      }
    } catch (err) {
      // Ignore estimation failures.
    }
    cursor.nextDate = formatDate(end);
    saveCursor(cursor);
    return {
      threads: threads,
      cursor: cursor,
      windowStart: start,
      windowEnd: end,
      totalEstimate: totalEstimate,
    };
  }

  function resetCursor() {
    SCRIPT_PROP.deleteProperty(CURSOR_KEY);
  }

  return {
    fetchNextBatch: fetchNextBatch,
    resetCursor: resetCursor,
  };
})(InboxBot.Utils);
