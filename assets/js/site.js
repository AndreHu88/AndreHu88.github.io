(function () {
  'use strict';

  var header = document.querySelector('[data-site-header]');
  var mobileTrigger = document.querySelector('[data-mobile-menu-trigger]');
  var mobileMenu = document.querySelector('[data-mobile-menu]');
  var searchDialog = document.getElementById('site-search');
  var searchInput = document.querySelector('[data-search-input]');
  var searchResults = document.querySelector('[data-search-results]');
  var searchStatus = document.querySelector('[data-search-status]');
  var searchIndexPromise;

  if (mobileTrigger && mobileMenu) {
    mobileTrigger.addEventListener('click', function () {
      var open = header.classList.toggle('mobile-menu-open');
      mobileTrigger.setAttribute('aria-expanded', String(open));
      mobileTrigger.querySelector('.material-symbols-rounded').textContent = open ? 'close' : 'menu';
    });
  }

  function loadSearchIndex() {
    if (searchIndexPromise) return searchIndexPromise;
    searchIndexPromise = Promise.all([
      fetch('/search.json').then(function (response) { return response.ok ? response.json() : []; }).catch(function () { return []; }),
      fetch('/book/search_plus_index.json').then(function (response) { return response.ok ? response.json() : {}; }).catch(function () { return {}; })
    ]).then(function (data) {
      var blogEntries = data[0];
      var bookEntries = Object.keys(data[1]).map(function (key) {
        var item = data[1][key];
        var path = item.url === './' ? '' : item.url;
        return { title: item.title, url: '/book/' + path, date: '', tags: item.keywords || '', body: item.body || '', source: '知识库' };
      });
      return blogEntries.concat(bookEntries);
    });
    return searchIndexPromise;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
    });
  }

  function renderSearchResults(query, entries) {
    var keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!keywords.length) {
      searchResults.innerHTML = '';
      searchStatus.textContent = '输入关键词，同时检索博客文章、知识库与工具。';
      return;
    }

    var matches = entries.filter(function (item) {
      var haystack = [item.title, item.tags, item.body].join(' ').toLowerCase();
      return keywords.every(function (keyword) { return haystack.indexOf(keyword) !== -1; });
    }).slice(0, 12);

    searchStatus.textContent = matches.length ? '找到 ' + matches.length + ' 条相关内容' : '没有找到相关内容，试试更短的关键词。';
    searchResults.innerHTML = matches.map(function (item) {
      return '<a class="search-result" href="' + encodeURI(item.url) + '">' +
        '<span class="search-result__source">' + escapeHtml(item.source) + '</span>' +
        '<strong>' + escapeHtml(item.title) + '</strong>' +
        '<span>' + escapeHtml((item.body || '').slice(0, 105)) + '</span>' +
        '<i class="material-symbols-rounded">arrow_forward</i></a>';
    }).join('');
  }

  function openSearch() {
    if (!searchDialog) return;
    searchDialog.showModal();
    loadSearchIndex().then(function (entries) {
      searchDialog._entries = entries;
      searchInput.focus();
    });
  }

  document.querySelectorAll('.js-search-open').forEach(function (button) { button.addEventListener('click', openSearch); });
  if (searchDialog) {
    searchDialog.querySelector('[data-search-close]').addEventListener('click', function () { searchDialog.close(); });
    searchDialog.addEventListener('click', function (event) { if (event.target === searchDialog) searchDialog.close(); });
    searchInput.addEventListener('input', function () { renderSearchResults(searchInput.value, searchDialog._entries || []); });
  }

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === 'Escape' && header && mobileTrigger) {
      header.classList.remove('mobile-menu-open');
      mobileTrigger.setAttribute('aria-expanded', 'false');
      mobileTrigger.querySelector('.material-symbols-rounded').textContent = 'menu';
    }
  });

  window.addEventListener('scroll', function () {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 24);
  }, { passive: true });
})();
