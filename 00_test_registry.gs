/**
 * Minimal global test registry for Apps Script (works regardless of load order).
 */
var __TESTS__ = globalThis.__TESTS__ || (globalThis.__TESTS__ = {
  list: [],
  add: function (name, fn) {
    this.list.push({ name: name || 'anonymous', fn: fn });
  },
});

/**
 * Back-compat helpers so legacy tests that call register(...) or TestRunner.register(...) still work.
 */
function register(fn) {
  __TESTS__.add(fn && fn.name ? fn.name : 'anonymous', fn);
}

var TestRunner = globalThis.TestRunner || (globalThis.TestRunner = {
  register: register,
});
