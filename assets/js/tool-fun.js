(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function randomUint32() {
    if (!globalThis.crypto || !globalThis.crypto.getRandomValues) throw new Error('当前浏览器不支持安全随机数。');
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }

  function secureRandomBelow(maximum, source) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 4294967296) throw new Error('随机范围必须是 1 到 4294967296 之间的整数。');
    var next = source || randomUint32;
    var limit = Math.floor(4294967296 / maximum) * maximum;
    var value;
    do { value = next(); } while (!Number.isInteger(value) || value < 0 || value >= limit);
    return value % maximum;
  }

  function secureShuffle(items, source) {
    var result = items.slice();
    for (var index = result.length - 1; index > 0; index -= 1) {
      var target = secureRandomBelow(index + 1, source);
      var value = result[index];
      result[index] = result[target];
      result[target] = value;
    }
    return result;
  }

  function randomPick(value, count, dedupe, source) {
    var items = String(value).split(/\r\n|\r|\n/).map(function (item) { return item.trim(); }).filter(Boolean);
    if (dedupe) {
      var seen = Object.create(null);
      items = items.filter(function (item) {
        var key = item.toLocaleLowerCase();
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
    }
    if (!items.length || !Number.isInteger(count) || count < 1 || count > items.length) throw new Error('抽取数量需在 1 到有效候选项数量之间。');
    var shuffled = secureShuffle(items, source);
    return { selected: shuffled.slice(0, count), shuffled: shuffled, candidateCount: items.length };
  }

  function rollDice(count, sides, modifier, source) {
    if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(sides) || sides < 2 || sides > 1000 || !Number.isInteger(modifier)) throw new Error('骰子数量需为 1–20，每个骰子需为 2–1000 面，修正值需为整数。');
    var rolls = [];
    for (var index = 0; index < count; index += 1) rolls.push(secureRandomBelow(sides, source) + 1);
    var subtotal = rolls.reduce(function (sum, value) { return sum + value; }, 0);
    return { rolls: rolls, subtotal: subtotal, modifier: modifier, total: subtotal + modifier };
  }

  function randomIntegers(minimum, maximum, count, source) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum || !Number.isInteger(count) || count < 1 || count > 1000) throw new Error('请输入有效整数范围，生成数量需为 1–1000。');
    var size = maximum - minimum + 1;
    if (size > 1000000) throw new Error('为保证浏览器性能，随机整数范围最多包含 100 万个数。');
    if (count > size) throw new Error('生成数量不能超过可选整数数量。');
    var values = [];
    for (var value = minimum; value <= maximum; value += 1) values.push(value);
    return secureShuffle(values, source).slice(0, count);
  }

  function escapeWifiValue(value) {
    return String(value || '').replace(/([\\;,:"])/g, '\\$1');
  }

  function qrPayload(mode, values) {
    var payload;
    if (mode === 'wifi') {
      if (!values.ssid) throw new Error('请输入 Wi-Fi 名称。');
      var security = values.security === 'nopass' ? 'nopass' : values.security === 'WEP' ? 'WEP' : 'WPA';
      if (security !== 'nopass' && !values.password) throw new Error('请输入 Wi-Fi 密码。');
      var passwordPart = security === 'nopass' ? '' : ';P:' + escapeWifiValue(values.password);
      payload = 'WIFI:T:' + security + ';S:' + escapeWifiValue(values.ssid) + passwordPart + ';H:' + (values.hidden ? 'true' : 'false') + ';;';
    } else {
      payload = String(values.content || '').trim();
      if (!payload) throw new Error('请输入需要生成二维码的内容。');
      if (mode === 'url' && !/^https?:\/\//i.test(payload)) payload = 'https://' + payload;
    }
    if (new TextEncoder().encode(payload).length > 2000) throw new Error('二维码内容不能超过 2000 个 UTF-8 字节。');
    return payload;
  }

  return {
    secureRandomBelow: secureRandomBelow,
    secureShuffle: secureShuffle,
    randomPick: randomPick,
    rollDice: rollDice,
    randomIntegers: randomIntegers,
    escapeWifiValue: escapeWifiValue,
    qrPayload: qrPayload
  };
}));
