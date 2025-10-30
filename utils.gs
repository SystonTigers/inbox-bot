var InboxBot = InboxBot || {};

InboxBot.Utils = (function () {
  function coalesce() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
        return arguments[i];
      }
    }
    return null;
  }

  function toBoolean(value, fallback) {
    if (value === true || value === false) {
      return value;
    }
    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
        return false;
      }
    }
    return fallback === undefined ? false : fallback;
  }

  function toNumber(value, fallback) {
    var num = Number(value);
    if (!isFinite(num)) {
      return fallback;
    }
    return num;
  }

  function ensureArray(value) {
    if (!value) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  }

  function chunkArray(items, size) {
    var chunks = [];
    for (var i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  function unique(values) {
    var seen = {};
    var deduped = [];
    for (var i = 0; i < values.length; i++) {
      if (!seen[values[i]]) {
        seen[values[i]] = true;
        deduped.push(values[i]);
      }
    }
    return deduped;
  }

  function now() {
    return new Date();
  }

  function timestamp() {
    return new Date().toISOString();
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return '"[unserializable]"';
    }
  }

  function safeParseJson(value, fallback) {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }

  function buildLabelName(prefix, label) {
    if (!prefix) {
      return label;
    }
    return prefix.replace(/\/$/, '') + '/' + label;
  }

  function sleep(ms) {
    Utilities.sleep(Math.max(0, ms || 0));
  }

  function backoff(baseMs, attempt) {
    var capped = Math.min(60000, baseMs * Math.pow(2, attempt));
    sleep(capped);
  }

  function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
  }

  function dateDaysAgo(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  function isWithinDays(date, days) {
    if (!date) {
      return false;
    }
    var compare = new Date(date);
    if (isNaN(compare.getTime())) {
      return false;
    }
    var threshold = dateDaysAgo(days);
    return compare >= threshold;
  }

  function extractHeader(message, name) {
    var headers = message.getHeader ? message.getHeader(name) : null;
    if (headers) {
      return headers;
    }
    try {
      var raw = message.getRawContent();
      if (!raw) {
        return null;
      }
      var regex = new RegExp('^' + name + ':\\s*(.*)$', 'im');
      var match = raw.match(regex);
      return match ? match[1] : null;
    } catch (err) {
      return null;
    }
  }

  function parseListHeader(value) {
    if (!value) {
      return null;
    }
    var trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    var match = trimmed.match(/<(.+)>/);
    return {
      raw: trimmed,
      address: match ? match[1] : trimmed.replace(/[<>]/g, ''),
    };
  }

  function summarizeError(err) {
    return (err && err.stack) ? err.stack : String(err);
  }

  function assertSheetHeaders(sheet, expectedHeaders) {
    var headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
    var existing = headerRange.getValues()[0];
    for (var i = 0; i < expectedHeaders.length; i++) {
      if (existing[i] !== expectedHeaders[i]) {
        headerRange.setValues([expectedHeaders]);
        break;
      }
    }
  }

  function parseCsvList(value) {
    if (!value) {
      return [];
    }
    return String(value).split(/[;,]/).map(function (entry) {
      return entry.trim();
    }).filter(function (entry) {
      return entry.length > 0;
    });
  }

  function matchPattern(value, pattern) {
    if (!pattern) {
      return false;
    }
    var normalizedValue = (value || '').toLowerCase();
    var normalizedPattern = pattern.toLowerCase();
    if (normalizedPattern.indexOf('*') !== -1) {
      var regex = '^' + normalizedPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
      return new RegExp(regex).test(normalizedValue);
    }
    return normalizedValue === normalizedPattern;
  }

  function ensureDriveFolderByPath(rootFolder, pathComponents) {
    var folder = rootFolder;
    for (var i = 0; i < pathComponents.length; i++) {
      var name = pathComponents[i];
      var iterator = folder.getFoldersByName(name);
      folder = iterator.hasNext() ? iterator.next() : folder.createFolder(name);
    }
    return folder;
  }

  function ensureDriveFolderByIdOrPath(folderId, pathComponents) {
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (err) {
        // Fallback to root path creation below.
      }
    }
    return ensureDriveFolderByPath(DriveApp.getRootFolder(), pathComponents);
  }

  return {
    coalesce: coalesce,
    toBoolean: toBoolean,
    toNumber: toNumber,
    ensureArray: ensureArray,
    chunkArray: chunkArray,
    unique: unique,
    now: now,
    timestamp: timestamp,
    safeJsonStringify: safeJsonStringify,
    safeParseJson: safeParseJson,
    buildLabelName: buildLabelName,
    sleep: sleep,
    backoff: backoff,
    formatDate: formatDate,
    dateDaysAgo: dateDaysAgo,
    isWithinDays: isWithinDays,
    extractHeader: extractHeader,
    parseListHeader: parseListHeader,
    summarizeError: summarizeError,
    assertSheetHeaders: assertSheetHeaders,
    parseCsvList: parseCsvList,
    matchPattern: matchPattern,
    ensureDriveFolderByPath: ensureDriveFolderByPath,
    ensureDriveFolderByIdOrPath: ensureDriveFolderByIdOrPath,
  };
})();
