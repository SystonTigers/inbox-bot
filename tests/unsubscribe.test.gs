__TESTS__.add('Unsubscribe detection', function(assert) {
  if (!InboxBot || !InboxBot.Unsubscribe || typeof InboxBot.Unsubscribe.detect !== 'function') {
    return;
  }
  var metadata = {
    from: 'newsletter@example.com',
    fromAddress: 'newsletter@example.com',
    headers: {
      listUnsubscribe: '<mailto:unsubscribe@example.com>, <https://example.com/unsub>'
    },
  };
  var result = InboxBot.Unsubscribe.detect(metadata);
  assert(result, 'Expected detect to return metadata');
  assert(result.candidates && result.candidates.length === 2, 'Expected two unsubscribe candidates');
  assert(result.candidates.some(function(c) { return c.method === 'MAILTO'; }), 'Missing MAILTO candidate');
  assert(result.candidates.some(function(c) { return c.method === 'HTTP'; }), 'Missing HTTP candidate');
});
