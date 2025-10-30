var InboxBot = InboxBot || {};

InboxBot.Unsubscribe = (function (Utils, Config) {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();
  var LAST_UNSUB_PROP = 'INBOX_BOT_LAST_UNSUB';
  var SHEET_HEADERS = ['sender', 'method', 'target', 'status', 'attempts', 'lastError', 'lastTriedAt'];

  function detect(metadata) {
    var header = metadata.headers.listUnsubscribe;
    if (!header) {
      return null;
    }
    var parts = header.split(',');
    var candidates = [];
    parts.forEach(function (part) {
      var trimmed = part.trim().replace(/[<>]/g, '');
      if (!trimmed) {
        return;
      }
      if (trimmed.toLowerCase().indexOf('mailto:') === 0) {
        candidates.push({
          method: 'MAILTO',
          target: trimmed.substring('mailto:'.length),
        });
      } else if (trimmed.indexOf('http') === 0) {
        candidates.push({
          method: 'HTTP',
          target: trimmed,
        });
      }
    });
    if (!candidates.length) {
      return null;
    }
    return {
      sender: metadata.fromAddress || metadata.from,
      candidates: candidates,
    };
  }

  function queue(metadata, config, reason) {
    if (metadata.senderHandling === 'NEVER_UNSUB') {
      return;
    }
    var sheet = config.sheets && config.sheets.unsub;
    if (!sheet) {
      var ss = Config.getControlSpreadsheet();
      sheet = ss.getSheetByName(Config.constants.UNSUB_SHEET);
    }
    if (!sheet) {
      throw new Error('UNSUB_Q sheet missing. Run bootstrap.');
    }
    Utils.assertSheetHeaders(sheet, SHEET_HEADERS);
    var unsubInfo = detect(metadata);
    if (!unsubInfo) {
      return;
    }
    unsubInfo.candidates.forEach(function (candidate) {
      sheet.appendRow([
        metadata.fromAddress || metadata.from,
        candidate.method,
        candidate.target,
        'NEW',
        0,
        '',
        '',
      ]);
    });
    SCRIPT_PROP.setProperty(LAST_UNSUB_PROP, Utils.timestamp());
  }

  function listQueued(config) {
    var sheet = config.sheets && config.sheets.unsub;
    if (!sheet) {
      var ss = Config.getControlSpreadsheet();
      sheet = ss.getSheetByName(Config.constants.UNSUB_SHEET);
    }
    if (!sheet) {
      return [];
    }
    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return [];
    }
    var result = [];
    for (var i = 1; i < rows.length; i++) {
      result.push({
        sender: rows[i][0],
        method: rows[i][1],
        target: rows[i][2],
        status: rows[i][3],
        attempts: rows[i][4],
        lastError: rows[i][5],
        lastTriedAt: rows[i][6],
      });
    }
    return result;
  }

  return {
    detect: detect,
    queue: queue,
    listQueued: listQueued,
  };
})(InboxBot.Utils, InboxBot.Config);
