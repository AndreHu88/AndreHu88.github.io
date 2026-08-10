(function () {
  'use strict';

  var hub = document.querySelector('[data-tools-hub]');
  if (!hub) return;
  var input = hub.querySelector('[data-tool-search-input]');
  var filterButtons = Array.prototype.slice.call(hub.querySelectorAll('[data-tool-filter]'));
  var categorySections = Array.prototype.slice.call(hub.querySelectorAll('.tool-category'));
  var status = hub.querySelector('[data-tool-filter-status]');
  var empty = hub.querySelector('[data-tools-empty]');
  var activeCategory = 'all';

  function normalized(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-CN');
  }

  function cardMatches(card, query) {
    var inCategory = activeCategory === 'all' || card.getAttribute('data-tool-category') === activeCategory;
    return inCategory && (!query || normalized(card.getAttribute('data-tool-search')).indexOf(query) !== -1);
  }

  function scrollToActiveCategory() {
    if (activeCategory === 'all') return;
    var target = hub.querySelector('[data-tool-section="' + activeCategory + '"]');
    if (!target) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function applyFilters() {
    var query = normalized(input.value);
    var visibleCount = 0;
    categorySections.forEach(function (section) {
      var sectionCount = 0;
      Array.prototype.forEach.call(section.querySelectorAll('[data-tool-card]'), function (card) {
        var visible = cardMatches(card, query);
        card.hidden = !visible;
        if (visible) {
          sectionCount += 1;
          visibleCount += 1;
        }
      });
      section.hidden = sectionCount === 0;
    });
    empty.hidden = visibleCount !== 0;
    status.textContent = visibleCount ? '找到 ' + visibleCount + ' 个工具' : '没有匹配的工具';
  }

  input.addEventListener('input', applyFilters);
  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeCategory = button.getAttribute('data-tool-filter');
      filterButtons.forEach(function (item) {
        var active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      applyFilters();
      scrollToActiveCategory();
    });
  });
  hub.querySelector('[data-tools-clear]').addEventListener('click', function () {
    input.value = '';
    filterButtons[0].click();
    input.focus();
  });
}());
