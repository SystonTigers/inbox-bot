function runAllTests() {
  var registry = globalThis.__TESTS__;
  if (!registry || !registry.list.length) {
    Logger.log('No tests registered.');
    return;
  }

  var passed = 0;
  var failed = 0;

  registry.list.forEach(function (test) {
    try {
      test.fn(assert);
      Logger.log('✅ ' + test.name);
      passed++;
    } catch (err) {
      Logger.log('❌ ' + test.name + ' :: ' + err.message);
      failed++;
    }
  });

  Logger.log('Done. Passed: ' + passed + '  Failed: ' + failed);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function runInboxBotTests() {
  runAllTests();
}
