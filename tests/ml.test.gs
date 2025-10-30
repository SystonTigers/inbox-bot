__TESTS__.add('ML classify finance detection', function(assert) {
  if (!InboxBot || !InboxBot.ML || typeof InboxBot.ML.classify !== 'function') {
    return;
  }
  var metadata = {
    subject: 'Invoice for October services',
    bodyPreview: 'Please find attached the invoice for your subscription.',
    headers: {
      listUnsubscribe: null,
    },
    messageId: 'test',
  };
  var result = InboxBot.ML.classify(metadata);
  assert(!!result, 'Expected classification result');
  assert(result.category === 'Finance', 'Expected Finance classification');
  assert(result.score >= 0 && result.score <= 1, 'Score should be bounded between 0 and 1');
});
