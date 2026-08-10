(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function utcDate(value) {
    return new Date(String(value) + 'T00:00:00Z');
  }

  function daysBetweenUtc(start, end) {
    return Math.round((end - start) / 86400000);
  }

  return {
    clamp: clamp,
    utcDate: utcDate,
    daysBetweenUtc: daysBetweenUtc
  };
}));
