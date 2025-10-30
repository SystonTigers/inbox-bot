var InboxBot = InboxBot || {};

InboxBot.Rules = (function (Utils, Config) {
  function parseRules(rows) {
    return rows.map(function (row, index) {
      var enabled = Utils.toBoolean(row.ENABLED, true);
      var priority = Utils.toNumber(row.PRIORITY, index + 1);
      var query = row.QUERY || '';
      var rule = {
        enabled: enabled,
        priority: priority,
        rawQuery: query,
        category: row.CATEGORY || '',
        actions: parseActions(row.ACTIONS),
        description: row.DESCRIPTION || '',
        type: query.indexOf('regex:') === 0 ? 'regex' : 'gmail',
      };
      if (rule.type === 'regex') {
        var pattern = query.substring('regex:'.length).trim();
        rule.regex = new RegExp(pattern, 'i');
      } else {
        rule.query = query;
      }
      return rule;
    }).filter(function (rule) {
      return rule.enabled && rule.category;
    }).sort(function (a, b) {
      return a.priority - b.priority;
    });
  }

  function parseActions(value) {
    if (!value) {
      return [];
    }
    return String(value).split(/[;,]/).map(function (part) {
      return part.trim().toLowerCase();
    }).filter(function (part) {
      return part.length > 0;
    });
  }

  function loadRules() {
    var rows = Config.loadRules();
    return parseRules(rows);
  }

  function resolveSenderHandling(metadata, senderRows) {
    var fromAddress = metadata.fromAddress || (metadata.from || '').toLowerCase();
    var domain = '';
    if (fromAddress.indexOf('@') !== -1) {
      domain = fromAddress.split('@')[1];
    }
    for (var i = 0; i < senderRows.length; i++) {
      var entry = senderRows[i];
      if (!entry.pattern) {
        continue;
      }
      if (Utils.matchPattern(fromAddress, entry.pattern) || (domain && Utils.matchPattern(domain, entry.pattern))) {
        return entry.handling || 'DEFAULT';
      }
    }
    return 'DEFAULT';
  }

  function classifyThread(thread, config) {
    var messages = thread.getMessages();
    var latest = messages[messages.length - 1];
    var metadata = extractMetadata(thread, latest);
    var senderRows = Config.loadSenders();
    metadata.senderHandling = resolveSenderHandling(metadata, senderRows);
    var ruleResult = evaluateRules(thread, metadata, config);
    if (ruleResult) {
      return ruleResult;
    }
    if (metadata.senderHandling === 'ALWAYS_ACTION') {
      return {
        category: 'Action/Reply Needed',
        score: 0.8,
        reason: 'Sender handling ALWAYS_ACTION',
        actions: ['label', 'star'],
        ruleMatched: false,
        ruleName: 'sender-handling',
        messageId: metadata.messageId,
        metadata: metadata,
      };
    }
    var heuristicResult = inferCategory(metadata, config);
    if (heuristicResult && heuristicResult.score >= 0.45) {
      return heuristicResult;
    }
    if (config.enableML) {
      var mlResult = InboxBot.ML.classify(metadata, config);
      if (mlResult) {
        return mlResult;
      }
    }
    return {
      category: 'Other/Uncategorized',
      score: 0.2,
      reason: 'Fallback default',
      actions: ['label'],
      ruleMatched: false,
      messageId: latest.getId(),
      metadata: metadata,
    };
  }

  function evaluateRules(thread, metadata, config) {
    var rules = loadRules();
    var latestMessageIdHeader = metadata.headers.messageId;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var matches = false;
      if (rule.type === 'regex' && rule.regex) {
        matches = rule.regex.test(metadata.subject) || rule.regex.test(metadata.bodyPreview);
      } else if (rule.query) {
        var query = rule.query;
        if (latestMessageIdHeader) {
          query = 'rfc822msgid:"' + latestMessageIdHeader + '" ' + query;
        }
        var candidates = GmailApp.search(query, 0, 1);
        matches = candidates.some(function (candidate) {
          return candidate.getId() === thread.getId();
        });
      }
      if (matches) {
        return {
          category: rule.category,
          score: 0.9,
          reason: 'Rule match',
          actions: rule.actions.length ? rule.actions : ['label'],
          ruleMatched: true,
          ruleName: rule.rawQuery,
          messageId: metadata.messageId,
          metadata: metadata,
          dryRun: config.dryRun,
        };
      }
    }
    return null;
  }

  function extractMetadata(thread, message) {
    var subject = message.getSubject() || '';
    var from = message.getFrom() || '';
    var fromAddress = from;
    var emailMatch = from.match(/<([^>]+)>/);
    if (emailMatch && emailMatch[1]) {
      fromAddress = emailMatch[1];
    }
    fromAddress = fromAddress.toLowerCase();
    var to = message.getTo() || '';
    var cc = message.getCc() || '';
    var body = message.getPlainBody() || '';
    var headers = {
      listId: Utils.extractHeader(message, 'List-Id'),
      listUnsubscribe: Utils.extractHeader(message, 'List-Unsubscribe'),
      precedence: Utils.extractHeader(message, 'Precedence'),
      autoSubmitted: Utils.extractHeader(message, 'Auto-Submitted'),
      messageId: Utils.extractHeader(message, 'Message-ID'),
    };
    return {
      threadId: thread.getId(),
      messageId: message.getId(),
      subject: subject,
      from: from,
      fromAddress: fromAddress,
      to: to,
      cc: cc,
      bodyPreview: body.substring(0, 2000),
      hasAttachments: message.getAttachments({includeInlineImages: false, includeAttachments: true}).length > 0,
      headers: headers,
      estimatedSize: message.getRawContent().length,
      historyId: thread.getHistoryId ? thread.getHistoryId() : null,
      isUnread: thread.isUnread(),
    };
  }

  function containsAny(text, keywords) {
    var lower = text.toLowerCase();
    return keywords.some(function (keyword) {
      return lower.indexOf(keyword.toLowerCase()) !== -1;
    });
  }

  function inferCategory(metadata, config) {
    var subject = metadata.subject.toLowerCase();
    var body = metadata.bodyPreview.toLowerCase();
    var from = metadata.fromAddress || (metadata.from || '').toLowerCase();
    var listId = metadata.headers.listId ? metadata.headers.listId.toLowerCase() : '';
    var listUnsub = metadata.headers.listUnsubscribe || '';
    var reasonPieces = [];
    var score = 0.1;
    var category = 'Other/Uncategorized';

    function boost(value, why) {
      score += value;
      reasonPieces.push(why);
    }

    if (containsAny(subject, ['invoice', 'receipt', 'payment', 'bill', 'statement']) ||
        containsAny(body, ['invoice', 'receipt', 'payment due', '$', 'usd', 'total due'])) {
      category = 'Finance';
      boost(0.4, 'Finance keywords');
    }
    if (metadata.hasAttachments && containsAny(subject, ['invoice', 'receipt', 'order'])) {
      boost(0.2, 'Finance attachment');
    }
    if (containsAny(subject, ['meeting', 'calendar', 'invite', 'webinar', 'event']) ||
        containsAny(body, ['ics', 'calendar event', 'agenda', 'zoom meeting'])) {
      category = 'Events/Calendar';
      boost(0.3, 'Event language');
    }
    if (containsAny(subject, ['shipped', 'delivery', 'order', 'tracking']) ||
        containsAny(body, ['tracking number', 'order number', 'arriving'])) {
      category = 'Shipping/Orders';
      boost(0.3, 'Logistics language');
    }
    if (containsAny(subject, ['security alert', 'verification code', 'password reset', 'sign-in']) ||
        containsAny(body, ['security alert', 'verification code', 'unusual activity'])) {
      category = 'Accounts/Security';
      boost(0.35, 'Security hints');
    }
    if (!category || category === 'Other/Uncategorized') {
      if (containsAny(subject, ['please respond', 'action required', 'reply needed']) ||
          containsAny(body, ['please let me know', 'awaiting your response'])) {
        category = 'Action/Reply Needed';
        boost(0.25, 'Action keywords');
      }
    }
    if (listId || listUnsub || containsAny(from, ['news', 'digest', 'newsletter']) ||
        containsAny(subject, ['newsletter', 'digest', 'update'])) {
      category = 'Newsletters/Marketing';
      boost(0.3, 'List heuristics');
    }
    if (containsAny(from, ['facebook', 'linkedin', 'twitter', 'instagram']) ||
        containsAny(subject, ['mentioned you', 'tagged you', 'new follower'])) {
      category = 'Social/Notifications';
      boost(0.3, 'Social sender');
    }
    if (containsAny(subject, ['just checking', 'thoughts?']) && metadata.isUnread) {
      category = 'Waiting-On';
      boost(0.2, 'Awaiting response heuristics');
    }
    if (!category || category === 'Other/Uncategorized') {
      if (!listId && !listUnsub && from.indexOf('@gmail.com') !== -1) {
        category = 'Personal (1:1)';
        boost(0.2, 'Personal sender fallback');
      }
    }

    return {
      category: category,
      score: Math.min(1, score),
      reason: reasonPieces.join('; ') || 'Heuristic fallback',
      actions: ['label'],
      ruleMatched: false,
      ruleName: 'heuristic',
      messageId: metadata.messageId,
      metadata: metadata,
    };
  }

  return {
    classifyThread: classifyThread,
    extractMetadata: extractMetadata,
  };
})(InboxBot.Utils, InboxBot.Config);
