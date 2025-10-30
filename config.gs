var InboxBot = InboxBot || {};

InboxBot.Config = (function (Utils) {
  var SCRIPT_PROP = PropertiesService.getScriptProperties();
  var CONTROL_SHEET_ID_KEY = 'INBOX_BOT_CONTROL_SHEET_ID';
  var CONFIG_SHEET = 'CONFIG';
  var RULES_SHEET = 'RULES';
  var SENDERS_SHEET = 'SENDERS';
  var LOG_SHEET = 'LOG';
  var DASHBOARD_SHEET = 'DASHBOARD';
  var UNSUB_SHEET = 'UNSUB_Q';

  var DEFAULT_CONFIG = {
    dryRun: true,
    archiveAfterLabel: false,
    enableML: true,
    enableUnsub: true,
    batchSize: 50,
    maxRuntimeMin: 5,
    sizeThresholdMB: 5,
    quarantineDays: 7,
    labelPrefix: 'DRYRUN/',
    searchWindow: 'newer_than:3y',
    archiveCategories: ['Newsletters/Marketing', 'Social/Notifications'],
    starCategories: ['Action/Reply Needed', 'Finance', 'Accounts/Security'],
    financeDriveRootFolderId: '',
  };

  var CATEGORIES = [
    'Action/Reply Needed',
    'Waiting-On',
    'Finance',
    'Events/Calendar',
    'Shipping/Orders',
    'Newsletters/Marketing',
    'Social/Notifications',
    'Accounts/Security',
    'Personal (1:1)',
    'Other/Uncategorized',
  ];

  function getControlSpreadsheet() {
    var sheetId = SCRIPT_PROP.getProperty(CONTROL_SHEET_ID_KEY);
    if (sheetId) {
      return SpreadsheetApp.openById(sheetId);
    }
    try {
      return SpreadsheetApp.getActive();
    } catch (err) {
      throw new Error('Control sheet not set. Run bootstrap or set control sheet ID.');
    }
  }

  function setControlSpreadsheetId(id) {
    if (!id) {
      throw new Error('Control sheet ID is required');
    }
    SCRIPT_PROP.setProperty(CONTROL_SHEET_ID_KEY, id);
  }

  function readSheetRows(sheet) {
    var values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) {
      return [];
    }
    var headers = values[0];
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = {};
      var hasValues = false;
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j];
        if (!key) {
          continue;
        }
        var cell = values[i][j];
        if (cell !== '' && cell !== null) {
          hasValues = true;
        }
        row[key] = cell;
      }
      if (hasValues) {
        rows.push(row);
      }
    }
    return rows;
  }

  function loadConfig() {
    var ss = getControlSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG_SHEET);
    if (!sheet) {
      throw new Error('CONFIG sheet missing. Run bootstrap.');
    }
    var rows = readSheetRows(sheet);
    var latest = rows.length ? rows[rows.length - 1] : {};
    var config = {};
    for (var key in DEFAULT_CONFIG) {
      config[key] = DEFAULT_CONFIG[key];
    }
    Object.keys(latest).forEach(function (key) {
      if (latest[key] === undefined || latest[key] === null || latest[key] === '') {
        return;
      }
      switch (key) {
        case 'dryRun':
        case 'archiveAfterLabel':
        case 'enableML':
        case 'enableUnsub':
          config[key] = Utils.toBoolean(latest[key], DEFAULT_CONFIG[key]);
          break;
        case 'batchSize':
        case 'maxRuntimeMin':
        case 'sizeThresholdMB':
        case 'quarantineDays':
          config[key] = Utils.toNumber(latest[key], DEFAULT_CONFIG[key]);
          break;
        case 'archiveCategories':
        case 'starCategories':
          var parsed = Utils.parseCsvList(latest[key]);
          config[key] = parsed.length ? parsed : DEFAULT_CONFIG[key];
          break;
        default:
          config[key] = latest[key];
      }
    });
    config.categories = CATEGORIES.slice();
    config.ss = ss;
    config.sheets = {
      config: sheet,
      rules: ss.getSheetByName(RULES_SHEET),
      senders: ss.getSheetByName(SENDERS_SHEET),
      log: ss.getSheetByName(LOG_SHEET),
      dashboard: ss.getSheetByName(DASHBOARD_SHEET),
      unsub: ss.getSheetByName(UNSUB_SHEET),
      reply: ss.getSheetByName('REPLY_Q'),
    };
    if (!config.financeDriveRootFolderId) {
      config.financeDriveRootFolderId = ensureFinanceRootFolder(config);
    }
    return config;
  }

  function loadRules() {
    var ss = getControlSpreadsheet();
    var sheet = ss.getSheetByName(RULES_SHEET);
    if (!sheet) {
      throw new Error('RULES sheet missing. Run bootstrap.');
    }
    return readSheetRows(sheet);
  }

  function loadSenders() {
    var ss = getControlSpreadsheet();
    var sheet = ss.getSheetByName(SENDERS_SHEET);
    if (!sheet) {
      throw new Error('SENDERS sheet missing. Run bootstrap.');
    }
    var rows = readSheetRows(sheet);
    return rows.map(function (row) {
      return {
        pattern: (row.SENDER_PATTERN || '').toLowerCase(),
        handling: (row.HANDLING || 'DEFAULT').toUpperCase(),
        notes: row.NOTES || '',
      };
    });
  }

  function ensureFinanceRootFolder(config) {
    var folder = Utils.ensureDriveFolderByPath(DriveApp.getRootFolder(), ['InboxBot', 'Receipts']);
    var id = folder.getId();
    if (config && config.sheets && config.sheets.config) {
      var sheet = config.sheets.config;
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var colIndex = headers.indexOf('financeDriveRootFolderId');
      if (colIndex !== -1) {
        sheet.getRange(sheet.getLastRow(), colIndex + 1).setValue(id);
      }
    }
    return id;
  }

  function getSheets() {
    var config = loadConfig();
    return config.sheets;
  }

  function getLabelPrefix(config) {
    return config.labelPrefix || DEFAULT_CONFIG.labelPrefix;
  }

  function resolveCategoryLabel(category, config) {
    var prefix = getLabelPrefix(config);
    return Utils.buildLabelName(prefix + '/Categories', category);
  }

  function resolveSystemLabel(name, config) {
    var prefix = getLabelPrefix(config);
    return Utils.buildLabelName(prefix + '/System', name);
  }

  function resolveReplyLabel(name, config) {
    var prefix = getLabelPrefix(config);
    return Utils.buildLabelName(prefix + '/Reply', name);
  }

  function resolveDryRunLabel(baseLabel) {
    return baseLabel;
  }

  return {
    loadConfig: loadConfig,
    loadRules: loadRules,
    loadSenders: loadSenders,
    getSheets: getSheets,
    getControlSpreadsheet: getControlSpreadsheet,
    setControlSpreadsheetId: setControlSpreadsheetId,
    getLabelPrefix: getLabelPrefix,
    resolveCategoryLabel: resolveCategoryLabel,
    resolveSystemLabel: resolveSystemLabel,
    resolveReplyLabel: resolveReplyLabel,
    resolveDryRunLabel: resolveDryRunLabel,
    ensureFinanceRootFolder: ensureFinanceRootFolder,
    constants: {
      CONFIG_SHEET: CONFIG_SHEET,
      RULES_SHEET: RULES_SHEET,
      SENDERS_SHEET: SENDERS_SHEET,
      LOG_SHEET: LOG_SHEET,
      DASHBOARD_SHEET: DASHBOARD_SHEET,
      UNSUB_SHEET: UNSUB_SHEET,
    },
  };
})(InboxBot.Utils);
