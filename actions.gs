var InboxBot = InboxBot || {};

InboxBot.Actions = (function (Utils, Config) {
  var USER_PROP = PropertiesService.getUserProperties();
  var EXPORT_PREFIX = 'INBOX_BOT_EXPORT_';

  function ensureLabel(name) {
    var label = GmailApp.getUserLabelByName(name);
    if (!label) {
      label = GmailApp.createLabel(name);
    }
    return label;
  }

  function ensureLabels(names) {
    return names.map(function (name) {
      return ensureLabel(name);
    });
  }

  function getThreadLabels(thread) {
    return thread.getLabels().map(function (label) {
      return label.getName();
    });
  }

  function applyLabelSet(thread, labels, dryRun) {
    var applied = [];
    labels.forEach(function (name) {
      var labelName = name;
      var label = ensureLabel(labelName);
      thread.addLabel(label);
      applied.push(labelName);
    });
    return applied;
  }

  function archiveThread(thread, dryRun) {
    if (dryRun) {
      return false;
    }
    thread.moveToArchive();
    return true;
  }

  function starThread(thread, dryRun) {
    if (dryRun) {
      return false;
    }
    thread.addStar();
    return true;
  }

  function unstarThread(thread, dryRun) {
    if (dryRun) {
      return false;
    }
    thread.removeStar();
    return true;
  }

  function markThreadRead(thread, dryRun) {
    if (dryRun) {
      return false;
    }
    thread.markRead();
    return true;
  }

  function quarantineThread(thread, config, dryRun) {
    var labelName = Config.resolveSystemLabel('Quarantine/Trash-Candidate (7d)', config);
    return applyLabelSet(thread, [labelName], dryRun);
  }

  function exportAttachments(message, config, dryRun) {
    if (dryRun) {
      return [];
    }
    var exportKey = EXPORT_PREFIX + message.getId();
    if (USER_PROP.getProperty(exportKey)) {
      return [];
    }
    var attachments = message.getAttachments({includeInlineImages: false, includeAttachments: true});
    if (!attachments || !attachments.length) {
      return [];
    }
    var exported = [];
    var sizeLimitBytes = (config.sizeThresholdMB || 5) * 1024 * 1024;
    var rootFolder = Utils.ensureDriveFolderByIdOrPath(
      config.financeDriveRootFolderId,
      ['InboxBot', 'Receipts']
    );
    var folder = Utils.ensureDriveFolderByPath(rootFolder, buildYearMonthComponents());
    attachments.forEach(function (attachment) {
      var contentType = attachment.getContentType().toLowerCase();
      if (contentType.indexOf('pdf') === -1 && contentType.indexOf('application') === -1) {
        return;
      }
      if (attachment.getBytes().length > sizeLimitBytes) {
        return;
      }
      var file = folder.createFile(attachment);
      exported.push({
        name: attachment.getName(),
        url: file.getUrl(),
      });
    });
    if (exported.length) {
      USER_PROP.setProperty(exportKey, '1');
    }
    return exported;
  }

  function buildYearMonthComponents() {
    var now = new Date();
    var year = String(now.getFullYear());
    var month = ('0' + (now.getMonth() + 1)).slice(-2);
    return [year, month];
  }

  function buildActionList(classification, config) {
    var actions = Utils.ensureArray(classification.actions || []);
    if (classification.category) {
      actions.push('label');
    }
    if (!classification.ruleMatched && config.enableML) {
      actions.push('ml-label');
    }
    if (classification.category && config.archiveAfterLabel) {
      actions.push('archive');
    }
    if (classification.category && config.archiveCategories.indexOf(classification.category) !== -1) {
      actions.push('archive');
    }
    if (classification.category && config.starCategories.indexOf(classification.category) !== -1) {
      actions.push('star');
    }
    return Utils.unique(actions);
  }

  function enact(thread, classification, config, run) {
    var dryRun = config.dryRun === true || classification.dryRun === true || run.dryRun === true;
    var oldLabels = getThreadLabels(thread);
    var actions = buildActionList(classification, config);
    var appliedLabels = [];
    var newLabels = [];
    var notes = [];
    var starred = false;
    var markRead = false;
    var archived = false;
    var exported = [];
    var unread = thread.isUnread();

    try {
      actions.forEach(function (action) {
        switch (action) {
          case 'label':
          case 'ml-label':
            var labelName = Config.resolveCategoryLabel(classification.category, config);
            appliedLabels = applyLabelSet(thread, [labelName], dryRun);
            newLabels = newLabels.concat(appliedLabels);
            break;
          case 'archive':
            if (archiveThread(thread, dryRun)) {
              notes.push('Archived');
              archived = true;
            } else if (dryRun) {
              notes.push('Archive would run');
            }
            break;
          case 'star':
            if (starThread(thread, dryRun)) {
              starred = true;
            } else if (dryRun) {
              notes.push('Star would be added');
            }
            break;
          case 'unstar':
            if (unstarThread(thread, dryRun)) {
              notes.push('Unstarred');
            }
            break;
          case 'mark-read':
            if (markThreadRead(thread, dryRun)) {
              markRead = true;
            }
            break;
          case 'quarantine':
            var quarantineLabels = quarantineThread(thread, config, dryRun);
            newLabels = newLabels.concat(quarantineLabels);
            break;
          case 'extract':
            var messages = thread.getMessages();
            var targetMessage = messages[messages.length - 1];
            var files = exportAttachments(targetMessage, config, dryRun);
            exported = exported.concat(files);
            if (files.length) {
              notes.push('Exported ' + files.length + ' attachments');
            }
            break;
          default:
            // No-op for unknown actions to remain forward compatible.
            notes.push('Skipped action ' + action);
        }
      });
      if (!dryRun && unread && (classification.category === 'Action/Reply Needed' || classification.category === 'Accounts/Security')) {
        // Keep unread to keep attention if required.
      } else if (!dryRun && !markRead && classification.category && config.archiveCategories.indexOf(classification.category) !== -1) {
        markThreadRead(thread, dryRun);
        markRead = true;
      }
    } catch (err) {
      InboxBot.Logging.logError(config, run, err, {
        threadId: thread.getId(),
        messageId: classification.messageId,
        category: classification.category,
        actions: actions,
        reason: 'Failed to enact actions',
      });
      throw err;
    }

    return {
      actions: actions,
      oldLabels: oldLabels,
      newLabels: newLabels,
      starred: starred,
      markRead: markRead,
      archived: archived,
      notes: notes,
      exported: exported,
    };
  }

  function undoAction(payload, config) {
    var thread = GmailApp.getThreadById(payload.threadId);
    if (!thread) {
      return;
    }
    Utils.ensureArray(payload.newLabels || []).forEach(function (labelName) {
      var label = GmailApp.getUserLabelByName(labelName);
      if (label) {
        thread.removeLabel(label);
      }
    });
    Utils.ensureArray(payload.oldLabels || []).forEach(function (labelName) {
      var label = GmailApp.getUserLabelByName(labelName);
      if (label) {
        thread.addLabel(label);
      }
    });
    if (payload.starred) {
      thread.removeStar();
    }
    if (payload.unstarred) {
      thread.addStar();
    }
    if (payload.markRead) {
      thread.markUnread();
    }
    if (payload.archived) {
      thread.moveToInbox();
    }
  }

  return {
    enact: enact,
    undoAction: undoAction,
  };
})(InboxBot.Utils, InboxBot.Config);
