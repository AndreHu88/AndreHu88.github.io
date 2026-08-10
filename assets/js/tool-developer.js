(function (root, factory) {
  var common = root && root.JackToolsCore ? root.JackToolsCore : require('./tool-core.js');
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (common) {
  'use strict';

  async function hashText(value, algorithm) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('当前浏览器不支持 Web Crypto。');
    var digest = await globalThis.crypto.subtle.digest(algorithm, new TextEncoder().encode(String(value)));
    return Array.from(new Uint8Array(digest)).map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function parseTimestamp(value) {
    var source = String(value).trim();
    var date;
    if (/^-?\d+(?:\.\d+)?$/.test(source)) {
      var numeric = Number(source);
      date = new Date(Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric);
    } else {
      date = new Date(source.replace(' ', 'T'));
    }
    if (!source || Number.isNaN(date.getTime())) throw new Error('无法识别这个时间，请检查格式。');
    return date;
  }

  function componentToHex(value) {
    return Math.round(common.clamp(value, 0, 255)).toString(16).padStart(2, '0');
  }

  function rgbaToHex(red, green, blue, alpha) {
    var result = '#' + componentToHex(red) + componentToHex(green) + componentToHex(blue);
    return alpha === undefined || alpha >= 1 ? result.toUpperCase() : (result + componentToHex(alpha * 255)).toUpperCase();
  }

  function rgbToHsl(red, green, blue, alpha) {
    var r = common.clamp(red, 0, 255) / 255;
    var g = common.clamp(green, 0, 255) / 255;
    var b = common.clamp(blue, 0, 255) / 255;
    var maximum = Math.max(r, g, b);
    var minimum = Math.min(r, g, b);
    var lightness = (maximum + minimum) / 2;
    var saturation = 0;
    var hue = 0;
    if (maximum !== minimum) {
      var delta = maximum - minimum;
      saturation = lightness > .5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
      if (maximum === r) hue = (g - b) / delta + (g < b ? 6 : 0);
      if (maximum === g) hue = (b - r) / delta + 2;
      if (maximum === b) hue = (r - g) / delta + 4;
      hue *= 60;
    }
    return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100), a: alpha === undefined ? 1 : alpha };
  }

  function hueToRgb(p, q, value) {
    var t = value;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hslToRgb(hue, saturation, lightness, alpha) {
    var h = ((hue % 360) + 360) % 360 / 360;
    var s = common.clamp(saturation, 0, 100) / 100;
    var l = common.clamp(lightness, 0, 100) / 100;
    var r = l;
    var g = l;
    var b = l;
    if (s !== 0) {
      var q = l < .5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
      b = hueToRgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a: alpha === undefined ? 1 : alpha };
  }

  function parseColor(value) {
    var text = String(value).trim();
    var hex = text.match(/^#?([\da-f]{3,8})$/i);
    if (hex) {
      var digits = hex[1];
      if (digits.length === 3 || digits.length === 4) digits = digits.split('').map(function (digit) { return digit + digit; }).join('');
      if (digits.length !== 6 && digits.length !== 8) throw new Error('请输入 3、4、6 或 8 位 HEX 颜色。');
      return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1 };
    }
    var rgb = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgb) return { r: common.clamp(Number(rgb[1]), 0, 255), g: common.clamp(Number(rgb[2]), 0, 255), b: common.clamp(Number(rgb[3]), 0, 255), a: rgb[4] === undefined ? 1 : common.clamp(Number(rgb[4]), 0, 1) };
    var hsl = text.match(/^hsla?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]), hsl[4] === undefined ? 1 : Number(hsl[4]));
    throw new Error('请输入 HEX、RGB(A) 或 HSL(A) 颜色。');
  }

  function colorFormats(value) {
    var rgb = parseColor(value);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b, rgb.a);
    var alpha = Math.round(rgb.a * 1000) / 1000;
    return {
      hex: rgbaToHex(rgb.r, rgb.g, rgb.b, rgb.a),
      rgb: alpha < 1 ? 'rgba(' + [rgb.r, rgb.g, rgb.b, alpha].join(', ') + ')' : 'rgb(' + [rgb.r, rgb.g, rgb.b].join(', ') + ')',
      hsl: alpha < 1 ? 'hsla(' + [hsl.h, hsl.s + '%', hsl.l + '%', alpha].join(', ') + ')' : 'hsl(' + [hsl.h, hsl.s + '%', hsl.l + '%'].join(', ') + ')'
    };
  }

  function addUtcMonthsClamped(date, months) {
    var targetMonth = date.getUTCMonth() + months;
    var firstDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth, 1));
    var lastDay = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
    firstDay.setUTCDate(Math.min(date.getUTCDate(), lastDay));
    return firstDay;
  }

  function dateDifference(start, end, inclusive) {
    var startDate = common.utcDate(start);
    var endDate = common.utcDate(end);
    var days = common.daysBetweenUtc(startDate, endDate);
    if (!Number.isFinite(days) || days < 0) throw new Error('结束日期必须不早于开始日期。');
    if (inclusive) days += 1;
    var years = endDate.getUTCFullYear() - startDate.getUTCFullYear();
    var cursor = addUtcMonthsClamped(startDate, years * 12);
    if (cursor > endDate) {
      years -= 1;
      cursor = addUtcMonthsClamped(startDate, years * 12);
    }
    var months = (endDate.getUTCFullYear() - cursor.getUTCFullYear()) * 12 + endDate.getUTCMonth() - cursor.getUTCMonth();
    var monthCursor = addUtcMonthsClamped(cursor, months);
    if (monthCursor > endDate) {
      months -= 1;
      monthCursor = addUtcMonthsClamped(cursor, months);
    }
    var remainingDays = common.daysBetweenUtc(monthCursor, endDate) + (inclusive ? 1 : 0);
    return { days: days, weeks: days / 7, years: years, months: months, remainingDays: remainingDays };
  }

  return {
    hashText: hashText,
    parseTimestamp: parseTimestamp,
    parseColor: parseColor,
    colorFormats: colorFormats,
    dateDifference: dateDifference
  };
}));
