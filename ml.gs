var InboxBot = InboxBot || {};

InboxBot.ML = (function () {
  var CATEGORY_KEYWORDS = {
    'Action/Reply Needed': ['reply', 'respond', 'please review', 'follow up', 'asap', 'urgent', 'need your'],
    'Waiting-On': ['any update', 'waiting', 'status update', 'checking in'],
    'Finance': ['invoice', 'receipt', 'payment', 'paid', 'due', 'statement', 'subscription'],
    'Events/Calendar': ['calendar', 'invite', 'event', 'rsvp', 'webinar', 'ics', 'meeting'],
    'Shipping/Orders': ['tracking', 'delivery', 'order', 'shipped', 'arriving', 'package'],
    'Newsletters/Marketing': ['newsletter', 'digest', 'sale', 'offer', 'promotion', 'unsubscribe'],
    'Social/Notifications': ['liked', 'mentioned', 'tagged', 'connection', 'follower', 'commented'],
    'Accounts/Security': ['security', 'password', 'verification code', 'login', 'sign in', 'alert'],
    'Personal (1:1)': ['hi', 'hello', 'catch up', 'family', 'friend'],
  };

  var CATEGORY_PENALTIES = {
    'Newsletters/Marketing': ['invoice', 'receipt'],
    'Action/Reply Needed': ['unsubscribe', 'newsletter'],
  };

  function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (token) {
      return token.length > 2;
    });
  }

  function classify(metadata) {
    var tokens = tokenize(metadata.subject + ' ' + metadata.bodyPreview);
    if (!tokens.length) {
      return null;
    }
    var scores = {};
    Object.keys(CATEGORY_KEYWORDS).forEach(function (category) {
      scores[category] = 0;
      var keywords = CATEGORY_KEYWORDS[category];
      keywords.forEach(function (keyword) {
        var weight = keyword.split(' ').length > 1 ? 1.5 : 1;
        if (metadata.subject.toLowerCase().indexOf(keyword) !== -1) {
          scores[category] += 2 * weight;
        }
        if (metadata.bodyPreview.toLowerCase().indexOf(keyword) !== -1) {
          scores[category] += weight;
        }
      });
      var penalties = CATEGORY_PENALTIES[category] || [];
      penalties.forEach(function (keyword) {
        if (metadata.subject.toLowerCase().indexOf(keyword) !== -1) {
          scores[category] -= 1.5;
        }
      });
      if (metadata.headers.listUnsubscribe && category === 'Newsletters/Marketing') {
        scores[category] += 2;
      }
      if (!metadata.headers.listUnsubscribe && category === 'Personal (1:1)' && (metadata.fromAddress || metadata.from || '').indexOf('@gmail.com') !== -1) {
        scores[category] += 1;
      }
    });
    var bestCategory = null;
    var bestScore = 0;
    Object.keys(scores).forEach(function (category) {
      if (scores[category] > bestScore) {
        bestScore = scores[category];
        bestCategory = category;
      }
    });
    if (!bestCategory) {
      return null;
    }
    return {
      category: bestCategory,
      score: Math.min(1, 0.2 + bestScore / 10),
      reason: 'ML keyword fallback',
      actions: ['label'],
      ruleMatched: false,
      messageId: metadata.messageId,
      metadata: metadata,
    };
  }

  return {
    classify: classify,
  };
})();
