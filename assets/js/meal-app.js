(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackMealApp = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function cleanCustomCandidates(value) {
    var seen = Object.create(null);
    return String(value || '').split(/\r\n|\r|\n/).map(function (item) { return item.trim(); }).filter(function (item) {
      var key = item.toLocaleLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function createMealApp(options) {
    var page = options.page;
    var form = options.form;
    var resultRoot = options.result;
    var definitions = options.data.definitions;
    var planner = options.planner;
    var historyIds = [];
    var currentResult = null;
    var activePlanIndex = 0;
    var dishCountCustomized = false;
    var suppressFilterReset = false;

    function labelFor(group, value) {
      var item = definitions[group].find(function (definition) { return definition.value === value; });
      return item ? item.label : value;
    }

    function renderOptionDefinitions() {
      var themeContainer = form.querySelector('[data-meal-theme-options]');
      var themes = definitions.themes.concat({ value: 'any', label: '不限主题', shortLabel: '不限', icon: 'apps' });
      themeContainer.innerHTML = themes.map(function (theme) {
        var checked = theme.value === 'rice-friendly' ? ' checked' : '';
        return '<label class="meal-theme-card"><input name="theme" type="radio" value="' + theme.value + '"' + checked + '><span class="material-symbols-rounded">' + theme.icon + '</span><strong>' + theme.label + '</strong></label>';
      }).join('');
      form.querySelector('[data-meal-style-options]').innerHTML = definitions.styles.map(function (style) {
        return '<label class="tool-check"><input name="allowedStyle" type="checkbox" value="' + style.value + '" checked>' + style.label + '</label>';
      }).join('');
      var ingredientOptions = Object.keys(definitions.ingredients).map(function (id) {
        return '<option value="' + options.escapeHtml(definitions.ingredients[id].label) + '">';
      }).join('');
      form.querySelector('[data-meal-ingredient-suggestions]').innerHTML = ingredientOptions;
    }

    function setGroupActive(group, active) {
      if (!group) return;
      group.hidden = !active;
      Array.prototype.forEach.call(group.querySelectorAll('input, select, textarea'), function (control) {
        control.disabled = !active;
      });
    }

    function selectedStyles() {
      return Array.prototype.map.call(form.querySelectorAll('[name="allowedStyle"]:checked'), function (input) { return input.value; });
    }

    function ingredientValues(kind) {
      return Array.prototype.map.call(form.querySelectorAll('[data-meal-ingredient-list="' + kind + '"] input'), function (input) {
        return input.value.trim();
      }).filter(Boolean);
    }

    function requestFromForm() {
      return {
        mode: form.elements.mode.value,
        people: Number(form.elements.people.value),
        dishCount: Number(form.elements.dishCount.value),
        dining: form.elements.dining.value,
        budgetPerPerson: form.elements.budgetPerPerson.value,
        theme: form.elements.theme ? form.elements.theme.value : 'rice-friendly',
        ratio: form.elements.ratio.value,
        maxSpice: form.elements.maxSpice.value,
        soupPolicy: form.elements.soupPolicy.value,
        allowedStyles: selectedStyles(),
        maxCookMinutes: form.elements.maxCookMinutes.value,
        preferredIngredients: ingredientValues('preferred'),
        avoidedIngredients: ingredientValues('avoided'),
        customCandidates: form.elements.customCandidates.value
      };
    }

    function validateStyles(focusInvalid) {
      var field = form.querySelector('[data-meal-style-field]');
      var error = form.querySelector('[data-meal-style-error]');
      var first = form.querySelector('[name="allowedStyle"]');
      var valid = form.elements.mode.value === 'custom' || selectedStyles().length > 0;
      field.setAttribute('aria-invalid', valid ? 'false' : 'true');
      error.hidden = valid;
      first.setCustomValidity(valid ? '' : '请至少选择一种普通菜式。');
      if (!valid && focusInvalid) {
        form.querySelector('[data-meal-advanced]').open = true;
        first.focus();
      }
      return valid;
    }

    function updateAdvancedSummary() {
      var ratio = form.elements.ratio.options[form.elements.ratio.selectedIndex].textContent;
      var spice = form.elements.maxSpice.options[form.elements.maxSpice.selectedIndex].textContent;
      var soup = form.elements.soupPolicy.options[form.elements.soupPolicy.selectedIndex].textContent;
      form.querySelector('[data-meal-advanced-summary]').textContent = ratio + ' · ' + spice + ' · ' + soup;
    }

    function updateFields() {
      var custom = form.elements.mode.value === 'custom';
      setGroupActive(form.querySelector('[data-meal-builtin]'), !custom);
      setGroupActive(form.querySelector('[data-meal-custom]'), custom);
      form.elements.customCandidates.required = custom;
      form.querySelector('[data-meal-cook-time]').hidden = form.elements.dining.value !== 'cook';
      form.elements.maxCookMinutes.disabled = custom || form.elements.dining.value !== 'cook';
      if (custom || form.elements.soupPolicy.value !== 'required' || Number(form.elements.dishCount.value) >= 2) form.elements.dishCount.setCustomValidity('');
      validateStyles(false);
      updateAdvancedSummary();
      updateCustomCount();
    }

    function updateCustomCount() {
      var count = cleanCustomCandidates(form.elements.customCandidates.value).length;
      form.querySelector('[data-meal-custom-count]').textContent = '当前 ' + count + ' 个有效候选';
    }

    function refreshIngredientRows(kind) {
      var rows = form.querySelectorAll('[data-meal-ingredient-list="' + kind + '"] [data-meal-ingredient-row]');
      Array.prototype.forEach.call(rows, function (row, index) {
        var input = row.querySelector('input');
        input.setAttribute('aria-label', (kind === 'preferred' ? '想用食材 ' : '忌口食材 ') + (index + 1));
        row.querySelector('button').setAttribute('aria-label', '删除第 ' + (index + 1) + ' 项食材');
      });
    }

    function addIngredientRow(kind) {
      var container = form.querySelector('[data-meal-ingredient-list="' + kind + '"]');
      if (container.children.length >= 20) throw new Error('每类食材最多添加 20 项。');
      var row = document.createElement('div');
      row.className = 'meal-ingredient-row';
      row.setAttribute('data-meal-ingredient-row', '');
      row.innerHTML = '<input name="' + (kind === 'preferred' ? 'preferredIngredient' : 'avoidedIngredient') + '" type="text" list="meal-ingredient-suggestions" maxlength="30" autocomplete="off" placeholder="例如：' + (kind === 'preferred' ? '土豆' : '海鲜') + '"><button class="tool-reset" type="button" data-remove-meal-ingredient>删除</button>';
      container.appendChild(row);
      refreshIngredientRows(kind);
      row.querySelector('input').focus();
    }

    function resetHistory(message, keepResult) {
      historyIds = [];
      if (!keepResult) currentResult = null;
      form.querySelector('[data-meal-history-status]').textContent = message || '本轮还没有推荐记录。';
    }

    function markFilterChanged(event) {
      if (suppressFilterReset || !event.target.matches('input, select, textarea')) return;
      if (event.target.name === 'dishCount') dishCountCustomized = true;
      if (event.target.name === 'customCandidates') updateCustomCount();
      updateFields();
      resetAfterFilterChange();
    }

    function resetAfterFilterChange() {
      if (!historyIds.length && !currentResult) return;
      activePlanIndex = 0;
      resetHistory('条件已变化，将从新的候选轮次开始推荐。');
      options.setResult('<p class="tool-placeholder">条件已更新，请重新生成三套菜单。</p>', '');
      options.setFormStatus('条件已变化，推荐历史已重置。', 'success');
    }

    function dishTagText(dish, request) {
      if (dish.diet === 'custom') return '自定义';
      var tags = [dish.diet === 'meat' ? '荤' : '素', dish.role === 'main' ? '主菜' : dish.role === 'side' ? '配菜' : '汤品'];
      if (dish.course !== 'soup') tags.push(labelFor('styles', dish.style));
      if (request.theme !== 'any' && dish.themes.indexOf(request.theme) >= 0) tags.push(labelFor('themes', request.theme));
      return tags.join(' · ');
    }

    function dishMetaText(dish, request) {
      if (dish.diet === 'custom') return '';
      var values = [labelFor('spice', dish.spice)];
      if (request.dining === 'cook') values.push(dish.cookMinutes + ' 分钟', labelFor('difficulty', dish.difficulty));
      return values.join(' · ');
    }

    function ingredientLabels(ids) {
      return ids.map(function (id) { return definitions.ingredients[id] ? definitions.ingredients[id].label : id; });
    }

    function escapedIngredientLabels(ids) {
      return ingredientLabels(ids).map(options.escapeHtml);
    }

    function planCopyText(plan, request) {
      var lines = [plan.label + '：' + plan.dishes.map(function (dish) { return dish.name; }).join('、')];
      if (!plan.summary.custom) {
        lines.push('菜单结构：' + plan.summary.structureLabel);
        lines.push('参考总价：' + options.money(plan.summary.priceRange[0]) + '–' + options.money(plan.summary.priceRange[1]));
        if (plan.reasons.length) lines.push('推荐理由：' + plan.reasons.join('；'));
        if (plan.summary.preferredIngredientsCovered.length) lines.push('已用食材：' + ingredientLabels(plan.summary.preferredIngredientsCovered).join('、'));
      }
      return lines.join('\n');
    }

    function renderDish(dish, planIndex, dishIndex, request, custom) {
      var typeClass = dish.diet === 'meat' ? 'is-meat' : dish.diet === 'vegetarian' ? 'is-vegetarian' : 'is-custom';
      var replace = custom ? '' : '<button type="button" data-replace-meal data-plan-index="' + planIndex + '" data-dish-index="' + dishIndex + '">换一道</button>';
      return '<li class="meal-plan-dish ' + typeClass + '"><div><strong>' + options.escapeHtml(dish.name) + '</strong><span>' + options.escapeHtml(dishTagText(dish, request)) + '</span><small>' + options.escapeHtml(dishMetaText(dish, request)) + '</small></div>' + replace + '</li>';
    }

    function renderStructureChips(structureLabel) {
      return String(structureLabel || '').split(' · ').filter(Boolean).map(function (part) {
        return '<span>' + options.escapeHtml(part) + '</span>';
      }).join('');
    }

    function renderPlanDetails(plan) {
      var covered = escapedIngredientLabels(plan.summary.preferredIngredientsCovered);
      var missing = escapedIngredientLabels(plan.summary.preferredIngredientsMissing);
      var ingredientText = covered.length ? '<p><strong>已用食材</strong><span>' + covered.join('、') + '</span></p>' : '';
      if (missing.length) ingredientText += '<p><strong>尚未覆盖</strong><span>' + missing.join('、') + '</span></p>';
      var notices = plan.notices.map(function (notice) {
        return '<p><strong>补位说明</strong><span>' + options.escapeHtml(notice) + '</span></p>';
      }).join('');
      if (!plan.reasons.length && !ingredientText && !notices) return '';
      return '<details class="meal-plan-details"><summary>为什么推荐这套</summary>' +
        (plan.reasons.length ? '<p><strong>推荐理由</strong><span>' + options.escapeHtml(plan.reasons.join('；')) + '</span></p>' : '') +
        ingredientText + notices + '</details>';
    }

    function renderPlanCard(plan, planIndex, request) {
      var custom = Boolean(plan.summary.custom);
      var theme = custom ? '随机分组' : request.theme === 'any' ? '不限主题' : labelFor('themes', request.theme) + '优先';
      var summary = custom ? '<p class="meal-plan-custom-note">只按你的候选随机分组，不套用菜单规则。</p>' :
        '<div class="meal-plan-overview"><div><small>参考总价</small><strong>' + options.money(plan.summary.priceRange[0]) + '–' + options.money(plan.summary.priceRange[1]) + '</strong><span>人均 ' + options.money(plan.summary.perPersonRange[0]) + '–' + options.money(plan.summary.perPersonRange[1]) + '</span></div><div class="meal-structure-chips" aria-label="菜单结构">' + renderStructureChips(plan.summary.structureLabel) + '</div></div>';
      var dishes = plan.dishes.map(function (dish, dishIndex) { return renderDish(dish, planIndex, dishIndex, request, custom); }).join('');
      var details = custom ? '' : renderPlanDetails(plan);
      return '<article class="meal-plan-card is-active" role="tabpanel" aria-labelledby="meal-plan-tab-' + planIndex + '" data-meal-plan-card data-plan-variant="' + String.fromCharCode(97 + planIndex) + '"><header><div><span>' + options.escapeHtml(plan.label) + '</span><small>当前查看</small></div><strong>' + options.escapeHtml(theme) + '</strong></header>' + summary + '<ol>' + dishes + '</ol>' + details + '<button class="button button--ghost meal-plan-copy" type="button" data-copy-meal-plan data-plan-index="' + planIndex + '"><span class="material-symbols-rounded">content_copy</span>复制这套菜单</button></article>';
    }

    function renderPlanTabs(plans, request) {
      return '<div class="meal-plan-tabs" role="tablist" aria-label="选择菜单方案">' + plans.map(function (plan, index) {
        var selected = index === activePlanIndex;
        var price = plan.summary.custom ? plan.dishes.length + ' 道候选' : options.money(plan.summary.priceRange[0]) + '–' + options.money(plan.summary.priceRange[1]);
        return '<button id="meal-plan-tab-' + index + '" type="button" role="tab" aria-selected="' + selected + '" tabindex="' + (selected ? '0' : '-1') + '" class="' + (selected ? 'is-active' : '') + '" data-select-meal-plan="' + index + '"><strong>' + options.escapeHtml(plan.label) + '</strong><span>' + options.escapeHtml(price) + '</span></button>';
      }).join('') + '</div>';
    }

    function renderSuccess(planned, request) {
      currentResult = planned;
      if (activePlanIndex >= planned.plans.length) activePlanIndex = 0;
      var html = '<div class="meal-result-header"><span class="eyebrow">三套完整菜单</span><h3>' + request.people + ' 人 · 每套 ' + request.dishCount + ' 道菜</h3><p>先选一套查看，需要时再切换或逐道替换。</p></div>' + renderPlanTabs(planned.plans, request) + '<div class="meal-plan-grid">' + renderPlanCard(planned.plans[activePlanIndex], activePlanIndex, request) + '</div>';
      var copy = planned.plans.map(function (plan) { return planCopyText(plan, request); }).join('\n\n');
      options.setResult(html, copy);
      historyIds = unique(historyIds.concat(planned.plans.flatMap(function (plan) { return plan.dishes.map(function (dish) { return dish.id; }); })));
      form.querySelector('[data-meal-history-status]').textContent = '本轮已展示 ' + historyIds.length + ' 道菜，换一批会优先避开它们。';
    }

    function unique(values) {
      return values.filter(function (value, index) { return values.indexOf(value) === index; });
    }

    function renderFailure(failure) {
      currentResult = null;
      form.querySelector('[data-meal-advanced]').open = true;
      var actions = failure.recoveries.map(function (recovery, index) {
        return '<button class="button button--ghost" type="button" data-meal-recovery="' + index + '">' + options.escapeHtml(recovery.label) + '</button>';
      }).join('');
      options.setResult('<div class="meal-empty"><span class="material-symbols-rounded">tune</span><h3>暂时无法组成三套完整菜单</h3><p>' + options.escapeHtml(failure.message) + '</p><div class="meal-recovery-actions">' + actions + '</div></div>', '');
      resultRoot._mealRecoveries = failure.recoveries;
      options.setFormStatus(failure.message, 'error');
    }

    function generate() {
      if (!validateStyles(true)) throw new Error('请至少选择一种普通菜式。');
      form.elements.dishCount.setCustomValidity('');
      if (form.elements.mode.value !== 'custom' && form.elements.soupPolicy.value === 'required' && Number(form.elements.dishCount.value) < 2) {
        form.querySelector('[data-meal-advanced]').open = true;
        form.elements.dishCount.setCustomValidity('固定一道汤时至少需要推荐 2 道菜。');
        form.elements.dishCount.focus();
        throw new Error('固定一道汤时至少需要推荐 2 道菜。');
      }
      var request = requestFromForm();
      var planned = planner.plan(request, { excludedDishIds: historyIds });
      if (planned.status !== 'success') { renderFailure(planned); return; }
      renderSuccess(planned, request);
    }

    function replaceDish(planIndex, dishIndex) {
      if (!currentResult) return;
      var request = requestFromForm();
      var replaced = planner.replace(request, currentResult, { planIndex: planIndex, dishIndex: dishIndex }, { excludedDishIds: historyIds });
      if (replaced.status !== 'success') {
        options.setFormStatus(replaced.message + ' 可以查看其他方案，或换一批菜单。', 'error');
        return;
      }
      activePlanIndex = planIndex;
      historyIds.push(replaced.replacementDishId);
      renderSuccess(replaced, request);
      options.setFormStatus('已安全替换这道菜。', 'success');
    }

    function applyRecovery(index) {
      var recovery = resultRoot._mealRecoveries[index];
      if (!recovery) return;
      suppressFilterReset = true;
      if (recovery.field === 'history') resetHistory('本轮记录已清空。');
      else if (recovery.field === 'allowedStyles') {
        Array.prototype.forEach.call(form.querySelectorAll('[name="allowedStyle"]'), function (input) { input.checked = true; });
      } else if (form.elements[recovery.field]) form.elements[recovery.field].value = recovery.value === null ? '' : recovery.value;
      suppressFilterReset = false;
      updateFields();
      generate();
    }

    function handleResultClick(event) {
      var planTab = event.target.closest('[data-select-meal-plan]');
      if (planTab && currentResult) {
        activePlanIndex = Number(planTab.getAttribute('data-select-meal-plan'));
        renderSuccess(currentResult, requestFromForm());
        return;
      }
      var replacement = event.target.closest('[data-replace-meal]');
      if (replacement) {
        replaceDish(Number(replacement.getAttribute('data-plan-index')), Number(replacement.getAttribute('data-dish-index')));
        return;
      }
      var recovery = event.target.closest('[data-meal-recovery]');
      if (recovery) { applyRecovery(Number(recovery.getAttribute('data-meal-recovery'))); return; }
      var copy = event.target.closest('[data-copy-meal-plan]');
      if (!copy || !currentResult) return;
      var plan = currentResult.plans[Number(copy.getAttribute('data-plan-index'))];
      navigator.clipboard.writeText(planCopyText(plan, requestFromForm())).then(function () {
        options.setFormStatus('这套菜单已复制。', 'success');
      }).catch(function () { options.showError(new Error('复制失败，请手动选择菜单文字。')); });
    }

    function handleResultKeydown(event) {
      if (!event.target.matches('[data-select-meal-plan]') || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0 || !currentResult) return;
      event.preventDefault();
      var direction = event.key === 'ArrowRight' ? 1 : -1;
      activePlanIndex = (activePlanIndex + direction + currentResult.plans.length) % currentResult.plans.length;
      renderSuccess(currentResult, requestFromForm());
      resultRoot.querySelector('[data-select-meal-plan="' + activePlanIndex + '"]').focus();
    }

    function handleFormClick(event) {
      var add = event.target.closest('[data-add-meal-ingredient]');
      if (add) { addIngredientRow(add.getAttribute('data-add-meal-ingredient')); return true; }
      var remove = event.target.closest('[data-remove-meal-ingredient]');
      if (!remove) return false;
      var list = remove.closest('[data-meal-ingredient-list]');
      var kind = list.getAttribute('data-meal-ingredient-list');
      remove.closest('[data-meal-ingredient-row]').remove();
      refreshIngredientRows(kind);
      updateFields();
      resetAfterFilterChange();
      return true;
    }

    function updateRecommendedDishCount() {
      if (dishCountCustomized) return;
      var people = Number(form.elements.people.value);
      if (Number.isInteger(people) && people >= 1 && people <= 12) form.elements.dishCount.value = Math.min(20, people + 1);
    }

    function resetDynamicRows() {
      Array.prototype.forEach.call(form.querySelectorAll('[data-meal-ingredient-list]'), function (list) { list.innerHTML = ''; });
      historyIds = []; currentResult = null; activePlanIndex = 0; dishCountCustomized = false;
    }

    function initialize() {
      renderOptionDefinitions();
      form.elements.people.addEventListener('input', updateRecommendedDishCount);
      form.addEventListener('input', markFilterChanged);
      form.addEventListener('change', markFilterChanged);
      resultRoot.addEventListener('click', handleResultClick);
      resultRoot.addEventListener('keydown', handleResultKeydown);
      updateFields();
    }

    return {
      initialize: initialize,
      handle: function (action) {
        if (action === 'reset-history') { resetHistory('本轮记录已清空，可以重新推荐。', true); options.setFormStatus('本轮记录已重置。', 'success'); return; }
        activePlanIndex = 0;
        generate();
      },
      updateFields: updateFields,
      updateCustomCount: updateCustomCount,
      handleFormClick: handleFormClick,
      resetDynamicRows: resetDynamicRows,
      resetHistory: resetHistory
    };
  }

  return { createMealApp: createMealApp };
}));
