(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GammaClipboard = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  async function copy(text, { writeText, timeoutMs = 1500 }) {
    if (!text) return false;
    // A pending browser permission/write must not leave the interface waiting forever.
    // execCommand('copy') can report true without updating the embedded browser clipboard.
    if (typeof writeText !== 'function') return false;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(writeText(text)).then(() => true, () => false),
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })
      ]);
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  return { copy };
});
