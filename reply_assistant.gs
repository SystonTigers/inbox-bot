var InboxBot = InboxBot || {};

InboxBot.ReplyAssistant = (function (Config, Utils, Logging) {
  var SHEET_HEADERS = ['timestamp', 'threadId', 'draftId', 'to', 'subject', 'template', 'preview', 'status'];
  var STATUS = {
    PENDING: 'PENDING',
    APPROVE: 'APPROVE',
    REJECT: 'REJECT',
    SENT: 'SENT',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
  };

  function queueForApproval() {
    var config = Config.loadConfig();
    var sheet = ensureReplySheet(config);
    var threads = collectCandidateThreads(config);
    if (!threads.length) {
      Logging.logOperation(config, 'REPLY_QUEUE', { processed: 0 });
      return;
    }
    var existing = buildExistingMap(sheet);
    var needsApprovalLabelName = Config.resolveReplyLabel('Needs Approval', config);
    var needsApprovalLabel = ensureLabel(needsApprovalLabelName);
    var created = 0;
    var appendRows = [];
    var maxDrafts = Math.min(threads.length, Math.max(config.batchSize || 50, 10));

    for (var i = 0; i < threads.length && created < maxDrafts; i++) {
      var thread = threads[i];
      var threadId = thread.getId();
      if (existing[threadId]) {
        continue;
      }
      if (threadHasLabel(thread, Config.resolveReplyLabel('Sent by Assistant', config)) ||
          threadHasLabel(thread, needsApprovalLabelName)) {
        continue;
      }
      try {
        var draftInfo = buildDraftForThread(thread, config);
        if (!draftInfo) {
          continue;
        }
        thread.addLabel(needsApprovalLabel);
        appendRows.push([
          Utils.timestamp(),
          threadId,
          draftInfo.draftId,
          draftInfo.to,
          draftInfo.subject,
          draftInfo.template,
          draftInfo.preview,
          STATUS.PENDING,
        ]);
        created++;
      } catch (err) {
        Logging.logOperation(config, 'REPLY_QUEUE_ERROR', {
          processed: 0,
          errors: Utils.summarizeError(err),
          rule: threadId,
        });
      }
    }

    if (appendRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, SHEET_HEADERS.length).setValues(appendRows);
    }
    Logging.logOperation(config, 'REPLY_QUEUE', { processed: created });
  }

  function sendApprovedDrafts() {
    var config = Config.loadConfig();
    var sheet = ensureReplySheet(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      Logging.logOperation(config, 'REPLY_SEND', { processed: 0 });
      return;
    }
    var headers = values[0];
    var idx = indexMap(headers);
    var processed = 0;
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var status = String(row[idx.status] || '').toUpperCase();
      if (status !== STATUS.APPROVE) {
        continue;
      }
      var draftId = row[idx.draftId];
      var threadId = row[idx.threadId];
      try {
        var draft = GmailApp.getDraft(draftId);
        if (!draft) {
          sheet.getRange(r + 1, idx.status + 1).setValue(STATUS.ERROR);
          continue;
        }
        draft.send();
        updateReplyLabels(threadId, config, true);
        sheet.getRange(r + 1, idx.status + 1).setValue(STATUS.SENT);
        processed++;
      } catch (err) {
        sheet.getRange(r + 1, idx.status + 1).setValue(STATUS.ERROR);
        Logging.logOperation(config, 'REPLY_SEND_ERROR', {
          processed: 0,
          errors: Utils.summarizeError(err),
          rule: threadId,
        });
      }
    }
    Logging.logOperation(config, 'REPLY_SEND', { processed: processed });
  }

  function discardRejectedDrafts() {
    var config = Config.loadConfig();
    var sheet = ensureReplySheet(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      Logging.logOperation(config, 'REPLY_DISCARD', { processed: 0 });
      return;
    }
    var headers = values[0];
    var idx = indexMap(headers);
    var processed = 0;
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var status = String(row[idx.status] || '').toUpperCase();
      if (status !== STATUS.REJECT) {
        continue;
      }
      var threadId = row[idx.threadId];
      try {
        updateReplyLabels(threadId, config, false);
        sheet.getRange(r + 1, idx.status + 1).setValue(STATUS.REJECTED);
        processed++;
      } catch (err) {
        sheet.getRange(r + 1, idx.status + 1).setValue(STATUS.ERROR);
        Logging.logOperation(config, 'REPLY_DISCARD_ERROR', {
          processed: 0,
          errors: Utils.summarizeError(err),
          rule: threadId,
        });
      }
    }
    Logging.logOperation(config, 'REPLY_DISCARD', { processed: processed });
  }

  function ensureReplySheet(config) {
    var sheet = config.sheets && config.sheets.reply;
    if (!sheet) {
      var ss = Config.getControlSpreadsheet();
      sheet = ss.getSheetByName('REPLY_Q');
      if (!sheet) {
        sheet = ss.insertSheet('REPLY_Q');
      }
    }
    Utils.assertSheetHeaders(sheet, SHEET_HEADERS);
    return sheet;
  }

  function collectCandidateThreads(config) {
    var threadsMap = {};
    var results = [];
    var actionLabel = Config.resolveCategoryLabel('Action/Reply Needed', config);
    var needsApprovalLabel = Config.resolveReplyLabel('Needs Approval', config);
    var sentLabel = Config.resolveReplyLabel('Sent by Assistant', config);
    var negativeLabels = [
      needsApprovalLabel,
      sentLabel,
    ];

    var queries = [];
    queries.push(buildQueryWithLabels(actionLabel, negativeLabels));
    queries.push(buildOneOnOneQuery(actionLabel, needsApprovalLabel, sentLabel));

    var limit = Math.max(config.batchSize || 50, 20);
    for (var i = 0; i < queries.length; i++) {
      var query = queries[i];
      if (!query) {
        continue;
      }
      var found = GmailApp.search(query, 0, limit);
      for (var t = 0; t < found.length; t++) {
        var thread = found[t];
        var id = thread.getId();
        if (threadsMap[id]) {
          continue;
        }
        threadsMap[id] = true;
        results.push(thread);
      }
    }
    return results;
  }

  function buildQueryWithLabels(baseLabel, negativeLabels) {
    if (!baseLabel) {
      return null;
    }
    var query = 'label:"' + baseLabel + '"';
    negativeLabels.forEach(function (label) {
      query += ' -label:"' + label + '"';
    });
    return query;
  }

  function buildOneOnOneQuery(actionLabel, needsApprovalLabel, sentLabel) {
    var query = 'in:inbox is:unread newer_than:7d';
    query += ' -category:promotions -category:social';
    if (actionLabel) {
      query += ' -label:"' + actionLabel + '"';
    }
    if (needsApprovalLabel) {
      query += ' -label:"' + needsApprovalLabel + '"';
    }
    if (sentLabel) {
      query += ' -label:"' + sentLabel + '"';
    }
    query += ' -label:list';
    return query;
  }

  function buildExistingMap(sheet) {
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idx = indexMap(headers);
    var map = {};
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!row[idx.threadId]) {
        continue;
      }
      var status = String(row[idx.status] || '').toUpperCase();
      if (status === STATUS.SENT || status === STATUS.REJECTED) {
        continue;
      }
      map[row[idx.threadId]] = true;
    }
    return map;
  }

  function buildDraftForThread(thread, config) {
    var messages = thread.getMessages();
    var latest = messages[messages.length - 1];
    var subject = latest.getSubject();
    var from = latest.getFrom();
    var templateInfo = selectTemplate(subject || '', latest.getPlainBody() || '');
    var body = buildTemplateBody(templateInfo.template);
    var options = {};
    if (templateInfo.useHtml) {
      options.htmlBody = body;
      body = '';
    }
    var draft = options.htmlBody ?
      thread.createDraftReply('', options) :
      thread.createDraftReply(body, options);
    var preview = templateInfo.preview || truncate(body || options.htmlBody || '', 140);
    return {
      draftId: draft.getId(),
      to: extractEmailAddress(from),
      subject: subject,
      template: templateInfo.template,
      preview: preview,
    };
  }

  function selectTemplate(subject, body) {
    var loweredSubject = subject.toLowerCase();
    var loweredBody = body.toLowerCase();
    if (containsAny(loweredSubject + ' ' + loweredBody, ['invoice', 'receipt', 'payment'])) {
      return { template: 'INVOICE' };
    }
    if (containsAny(loweredSubject + ' ' + loweredBody, ['meeting', 'schedule', 'calendar', 'call'])) {
      return { template: 'MEETING' };
    }
    if (containsAny(loweredSubject + ' ' + loweredBody, ['thank', 'thanks', 'appreciate'])) {
      return { template: 'ACK' };
    }
    return { template: 'GENERIC' };
  }

  function buildTemplateBody(template) {
    var body;
    switch (template) {
      case 'INVOICE':
        body = [
          'Hi [Name],',
          '',
          'Thanks for sending this over. I\'ll review the invoice and confirm next steps shortly.',
          '',
          'Best,',
          '[Your Name]',
        ].join('\n');
        break;
      case 'MEETING':
        body = [
          'Hi [Name],',
          '',
          'Thanks for reaching out. I\'m available to connect—does [proposed time] work for you?',
          'Let me know if another time fits better.',
          '',
          'Best,',
          '[Your Name]',
        ].join('\n');
        break;
      case 'ACK':
        body = [
          'Hi [Name],',
          '',
          'Appreciate the update. I\'ll circle back if I need anything else.',
          '',
          'Best,',
          '[Your Name]',
        ].join('\n');
        break;
      default:
        body = [
          'Hi [Name],',
          '',
          'Thanks for reaching out. I\'ll get back to you shortly with more details.',
          '',
          'Best regards,',
          '[Your Name]',
        ].join('\n');
    }
    return body;
  }

  function updateReplyLabels(threadId, config, sent) {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      return;
    }
    var needsLabelName = Config.resolveReplyLabel('Needs Approval', config);
    var sentLabelName = Config.resolveReplyLabel('Sent by Assistant', config);
    var needsLabel = GmailApp.getUserLabelByName(needsLabelName);
    if (needsLabel) {
      thread.removeLabel(needsLabel);
    }
    if (sent) {
      thread.addLabel(ensureLabel(sentLabelName));
    }
  }

  function ensureLabel(name) {
    var label = GmailApp.getUserLabelByName(name);
    if (!label) {
      label = GmailApp.createLabel(name);
    }
    return label;
  }

  function threadHasLabel(thread, labelName) {
    if (!labelName) {
      return false;
    }
    var labels = thread.getLabels();
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].getName() === labelName) {
        return true;
      }
    }
    return false;
  }

  function containsAny(text, keywords) {
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) {
        return true;
      }
    }
    return false;
  }

  function extractEmailAddress(fromField) {
    if (!fromField) {
      return '';
    }
    var match = fromField.match(/<(.+?)>/);
    return match ? match[1] : fromField;
  }

  function truncate(text, length) {
    var clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= length) {
      return clean;
    }
    return clean.substring(0, length - 3) + '...';
  }

  function indexMap(headers) {
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      map[headers[i]] = i;
    }
    return {
      timestamp: map.timestamp,
      threadId: map.threadId,
      draftId: map.draftId,
      to: map.to,
      subject: map.subject,
      template: map.template,
      preview: map.preview,
      status: map.status,
    };
  }

  return {
    queueForApproval: queueForApproval,
    sendApprovedDrafts: sendApprovedDrafts,
    discardRejectedDrafts: discardRejectedDrafts,
  };
})(InboxBot.Config, InboxBot.Utils, InboxBot.Logging);
