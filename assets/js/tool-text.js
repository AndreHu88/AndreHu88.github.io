(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackToolsCore = Object.assign(root.JackToolsCore || {}, api);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bytesToBinary(bytes) {
    var chunks = [];
    for (var index = 0; index < bytes.length; index += 8192) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(index, index + 8192)));
    }
    return chunks.join('');
  }

  function utf8ToBase64(value) {
    return btoa(bytesToBinary(new TextEncoder().encode(String(value))));
  }

  function base64ToUtf8(value) {
    try {
      var normalized = String(value).replace(/\s+/g, '');
      var binary = atob(normalized);
      var bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      throw new Error('请输入有效的 Base64 内容，并确认它编码的是 UTF-8 文本。');
    }
  }

  function countText(value) {
    var text = String(value);
    var characters = Array.from(text);
    var han = text.match(/\p{Script=Han}/gu) || [];
    var words = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
    var readingUnits = han.length + words.length;
    return {
      characters: characters.length,
      charactersWithoutSpaces: characters.filter(function (character) { return !/\s/u.test(character); }).length,
      han: han.length,
      words: words.length,
      lines: text ? text.split(/\r\n|\r|\n/).length : 0,
      bytes: new TextEncoder().encode(text).length,
      readingMinutes: readingUnits ? Math.max(1, Math.ceil(readingUnits / 300)) : 0
    };
  }

  function encodeUrl(value, componentMode) {
    return componentMode ? encodeURIComponent(value) : encodeURI(value);
  }

  function decodeUrl(value, componentMode) {
    try {
      return componentMode ? decodeURIComponent(value) : decodeURI(value);
    } catch (error) {
      throw new Error('URL 解码失败，请检查百分号编码是否完整。');
    }
  }

  function formatJson(value, compact) {
    try {
      return JSON.stringify(JSON.parse(value), null, compact ? 0 : 2);
    } catch (error) {
      throw new Error('JSON 解析失败：' + error.message);
    }
  }

  return {
    utf8ToBase64: utf8ToBase64,
    base64ToUtf8: base64ToUtf8,
    countText: countText,
    encodeUrl: encodeUrl,
    decodeUrl: decodeUrl,
    formatJson: formatJson
  };
}));
