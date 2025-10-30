var InboxBot = InboxBot || {};

InboxBot.Bootstrap = (function (Config, Utils) {
  function ensureSheets() {
    var ss = SpreadsheetApp.getActive();
    if (!ss) {
      throw new Error('Open the control spreadsheet and run bootstrap from there.');
    }
    Config.setControlSpreadsheetId(ss.getId());
    var sheets = {
      CONFIG: ensureSheet(ss, Config.constants.CONFIG_SHEET),
      RULES: ensureSheet(ss, Config.constants.RULES_SHEET),
      SENDERS: ensureSheet(ss, Config.constants.SENDERS_SHEET),
      LOG: ensureSheet(ss, Config.constants.LOG_SHEET),
      UNSUB_Q: ensureSheet(ss, Config.constants.UNSUB_SHEET),
      DASHBOARD: ensureSheet(ss, Config.constants.DASHBOARD_SHEET),
      REPLY_Q: ensureSheet(ss, 'REPLY_Q'),
    };
    primeConfigSheet(sheets.CONFIG);
    primeRulesSheet(sheets.RULES);
    primeSendersSheet(sheets.SENDERS);
    primeLogSheet(sheets.LOG);
    primeUnsubSheet(sheets.UNSUB_Q);
    primeDashboardSheet(sheets.DASHBOARD);
    primeReplySheet(sheets.REPLY_Q);
  }

  function ensureSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    return sheet;
  }

  function primeConfigSheet(sheet) {
    var headers = [
      'dryRun',
      'archiveAfterLabel',
      'enableML',
      'enableUnsub',
      'batchSize',
      'maxRuntimeMin',
      'sizeThresholdMB',
      'quarantineDays',
      'labelPrefix',
      'searchWindow',
      'archiveCategories',
      'starCategories',
      'financeDriveRootFolderId',
    ];
    Utils.assertSheetHeaders(sheet, headers);
    if (sheet.getLastRow() < 2) {
      sheet.appendRow([
        true,
        false,
        true,
        true,
        50,
        5,
        5,
        7,
        'DRYRUN/',
        'newer_than:3y',
        'Newsletters/Marketing;Social/Notifications',
        'Action/Reply Needed;Finance;Accounts/Security',
        '',
      ]);
      var folder = Utils.ensureDriveFolderByPath(DriveApp.getRootFolder(), ['InboxBot', 'Receipts']);
      var colIndex = headers.indexOf('financeDriveRootFolderId') + 1;
      sheet.getRange(sheet.getLastRow(), colIndex).setValue(folder.getId());
    }
  }

  function primeRulesSheet(sheet) {
    var headers = [
      'ENABLED',
      'PRIORITY',
      'QUERY',
      'CATEGORY',
      'ACTIONS',
    ];
    Utils.assertSheetHeaders(sheet, headers);
    if (sheet.getLastRow() < 2) {
      sheet.appendRow([true, 1, '(from:(order-update@amazon.com OR shipment-tracking@amazon.com) OR subject:"your amazon.com order")', 'Shipping/Orders', 'label,archive']);
      sheet.appendRow([true, 2, '(subject:(invoice OR receipt) OR filename:pdf)', 'Finance', 'label,extract,star']);
      sheet.appendRow([true, 3, 'category:social', 'Social/Notifications', 'label,archive']);
      sheet.appendRow([true, 4, 'category:promotions', 'Newsletters/Marketing', 'label,archive']);
      sheet.appendRow([true, 5, '(subject:("verification code" OR "password reset") OR body:("verification code"))', 'Accounts/Security', 'label,star']);
      sheet.appendRow([true, 6, '(filename:ics OR subject:("calendar invite" OR meeting OR webinar))', 'Events/Calendar', 'label']);
      sheet.appendRow([false, 999, 'in:inbox', 'Other/Uncategorized', 'label']);
    }
  }

  function primeSendersSheet(sheet) {
    var headers = [
      'SENDER_PATTERN',
      'HANDLING',
      'NOTES',
    ];
    Utils.assertSheetHeaders(sheet, headers);
    if (sheet.getLastRow() < 2) {
      sheet.appendRow(['ceo@company.com', 'ALWAYS_ACTION', 'Escalate immediately']);
      sheet.appendRow(['*@announcements.example', 'NEVER_UNSUB', 'Keep for compliance']);
      sheet.appendRow(['newsletter@*', 'DEFAULT', 'Eligible for unsubscribe queue']);
    }
  }

  function primeLogSheet(sheet) {
    Utils.assertSheetHeaders(sheet, InboxBot.Logging.constants.LOG_HEADERS);
  }

  function primeUnsubSheet(sheet) {
    var headers = ['sender', 'method', 'target', 'status', 'attempts', 'lastError', 'lastTriedAt'];
    Utils.assertSheetHeaders(sheet, headers);
  }

  function primeDashboardSheet(sheet) {
    sheet.clear();
    sheet.getRange(1, 1, 1, 1).setValue('Inbox Bot Dashboard');
    sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
    sheet.getRange(3, 1).setValue('Run metrics will populate after first execution.');
    sheet.getRange(4, 1).setValue('Today/7d/30d metrics and top senders update automatically.');
  }

  function primeReplySheet(sheet) {
    var headers = ['timestamp', 'threadId', 'draftId', 'to', 'subject', 'template', 'preview', 'status'];
    Utils.assertSheetHeaders(sheet, headers);
    if (sheet.getLastRow() < 2) {
      sheet.appendRow([Utils.timestamp(), 'sample-thread-1', 'draft-abc', 'partner@example.com', 'Thanks for the update', 'ACK', 'Hi Partner, thanks for the note...', 'PENDING']);
      sheet.appendRow([Utils.timestamp(), 'sample-thread-2', 'draft-def', 'vendor@example.com', 'Invoice 12345', 'INVOICE', 'Hi Vendor, thanks for sending the invoice...', 'APPROVE']);
    }
  }

  return {
    ensureSheets: ensureSheets,
  };
})(InboxBot.Config, InboxBot.Utils);
