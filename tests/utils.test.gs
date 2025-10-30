__TESTS__.add('Utils conversions', function(assert) {
  assert(InboxBot && InboxBot.Utils, 'Utils namespace missing');
  assert(InboxBot.Utils.toBoolean('yes') === true, 'Expected yes -> true');
  assert(InboxBot.Utils.toBoolean('no') === false, 'Expected no -> false');
  assert(InboxBot.Utils.toNumber('10', 0) === 10, 'Expected \"10\" -> 10');
  assert(InboxBot.Utils.toNumber('abc', 5) === 5, 'Fallback number not respected');
});
