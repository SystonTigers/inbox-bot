var InboxBot = InboxBot || {};

InboxBot.Incremental = (function () {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();
  var CURSOR_KEY = 'INBOX_BOT_INCREMENTAL_CURSOR';

  function getCursor() {
    var json = SCRIPT_PROP.getProperty(CURSOR_KEY);
    if (!json) {
      return {
        offset: 0,
        lastWindowStart: new Date().toISOString(),
      };
    }
    try {
      return JSON.parse(json);
    } catch (err) {
      return {
        offset: 0,
        lastWindowStart: new Date().toISOString(),
      };
    }
  }

  function saveCursor(cursor) {
    SCRIPT_PROP.setProperty(CURSOR_KEY, JSON.stringify(cursor));
  }

  function fetchNextBatch(config) {
    var cursor = getCursor();
    var windowQuery = config.searchWindow || 'newer_than:3d';
    var queryParts = [windowQuery, '-label:trash', '-label:spam'];
    var query = queryParts.join(' ');
    var threads = GmailApp.search(query, cursor.offset, config.batchSize || 50);
    if (!threads.length) {
      cursor.offset = 0;
      cursor.lastWindowStart = new Date().toISOString();
      saveCursor(cursor);
      return {
        threads: [],
        cursor: cursor,
      };
    }
    cursor.offset += threads.length;
    saveCursor(cursor);
    return {
      threads: threads,
      cursor: cursor,
    };
  }

  function resetCursor() {
    SCRIPT_PROP.deleteProperty(CURSOR_KEY);
  }

  return {
    fetchNextBatch: fetchNextBatch,
    resetCursor: resetCursor,
  };
})();
