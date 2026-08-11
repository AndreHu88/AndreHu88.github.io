(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackMealPlanner = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var UINT32_RANGE = 4294967296;

  function secureRandomValue() {
    if (!globalThis.crypto || !globalThis.crypto.getRandomValues) throw new Error('当前浏览器不支持安全随机数。');
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }

  function randomBelow(maximum, source) {
    var limit = Math.floor(UINT32_RANGE / maximum) * maximum;
    var value;
    do { value = source(); } while (!Number.isInteger(value) || value < 0 || value >= limit);
    return value % maximum;
  }

  function shuffled(items, source) {
    var copy = items.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var target = randomBelow(index + 1, source);
      var item = copy[index];
      copy[index] = copy[target];
      copy[target] = item;
    }
    return copy;
  }

  function unique(values) {
    return values.filter(function (value, index) { return values.indexOf(value) === index; });
  }

  function validateCatalog(catalog, definitions) {
    var ids = Object.create(null);
    var names = Object.create(null);
    var themes = definitions.themes.map(function (item) { return item.value; });
    var styles = definitions.styles.map(function (item) { return item.value; });
    catalog.forEach(function (dish) {
      if (!dish.id || ids[dish.id] || !dish.name || names[dish.name]) throw new Error('菜品目录包含重复或缺失的标识。');
      ids[dish.id] = true; names[dish.name] = true;
      if (!dish.themes.length || dish.themes.some(function (theme) { return themes.indexOf(theme) < 0; })) throw new Error('菜品“' + dish.name + '”的主题无效。');
      if (styles.indexOf(dish.style) < 0 || !dish.primaryIngredients.length) throw new Error('菜品“' + dish.name + '”缺少结构或食材数据。');
      ['cook', 'takeout', 'dine-in'].forEach(function (mode) {
        if (!dish.prices[mode] || dish.prices[mode].length !== 2) throw new Error('菜品“' + dish.name + '”缺少价格数据。');
      });
    });
  }

  function cleanTextItems(value) {
    var source = Array.isArray(value) ? value : String(value || '').split(/\r\n|\r|\n/);
    var seen = Object.create(null);
    return source.map(function (item) { return String(item).trim(); }).filter(function (item) {
      var key = item.toLocaleLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function normalizeIngredient(value, definitions) {
    var text = String(value || '').trim().toLocaleLowerCase();
    var match = Object.keys(definitions.ingredients).find(function (id) {
      var item = definitions.ingredients[id];
      return id === text || item.label.toLocaleLowerCase() === text
        || item.aliases.some(function (alias) { return alias.toLocaleLowerCase() === text; });
    });
    return match || text;
  }

  function normalizedIngredients(values, definitions) {
    return unique(cleanTextItems(values).map(function (value) { return normalizeIngredient(value, definitions); }));
  }

  function ratioTargets(dishCount, ratio) {
    var meatTargets = {
      balanced: Math.floor(dishCount / 2),
      'meat-heavy': Math.ceil(dishCount * 0.75),
      'vegetable-heavy': Math.floor(dishCount * 0.25),
      'all-meat': dishCount,
      'all-vegetarian': 0
    };
    if (meatTargets[ratio] === undefined) throw new Error('请选择有效的荤素结构。');
    return { meat: meatTargets[ratio], vegetable: dishCount - meatTargets[ratio] };
  }

  function normalizeRequest(request, definitions) {
    var input = request || {};
    var people = Number(input.people);
    var dishCount = Number(input.dishCount);
    if (!Number.isInteger(people) || people < 1 || people > 12) throw new Error('用餐人数需为 1–12 的整数。');
    if (!Number.isInteger(dishCount) || dishCount < 1 || dishCount > 20) throw new Error('推荐菜数量需为 1–20 的整数。');
    var themeValues = definitions.themes.map(function (item) { return item.value; }).concat('any');
    var styleValues = definitions.styles.map(function (item) { return item.value; });
    var styles = unique(input.allowedStyles || styleValues);
    if (themeValues.indexOf(input.theme || 'rice-friendly') < 0) throw new Error('请选择有效的推荐主题。');
    if (!styles.length || styles.some(function (style) { return styleValues.indexOf(style) < 0; })) throw new Error('请至少选择一种普通菜式。');
    if (['none', 'optional', 'required'].indexOf(input.soupPolicy || 'optional') < 0) throw new Error('请选择有效的汤品规则。');
    if ((input.soupPolicy || 'optional') === 'required' && dishCount < 2) throw new Error('固定一道汤时需要至少推荐 2 道菜。');
    var budget = input.budgetPerPerson === '' || input.budgetPerPerson === null || input.budgetPerPerson === undefined ? null : Number(input.budgetPerPerson);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 10000)) throw new Error('人均预算需为 0–10000 元。');
    var maxMinutes = input.maxCookMinutes === '' || input.maxCookMinutes === null || input.maxCookMinutes === undefined ? null : Number(input.maxCookMinutes);
    if (maxMinutes !== null && (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 600)) throw new Error('单道菜耗时上限需为 1–600 分钟。');
    return {
      mode: input.mode === 'custom' ? 'custom' : 'builtin', people: people, dishCount: dishCount,
      dining: ['cook', 'takeout', 'dine-in'].indexOf(input.dining) >= 0 ? input.dining : 'cook',
      budgetPerPerson: budget, theme: input.theme || 'rice-friendly', ratio: input.ratio || 'balanced',
      maxSpice: input.maxSpice || 'any', soupPolicy: input.soupPolicy || 'optional',
      allowedStyles: styles, maxCookMinutes: maxMinutes,
      preferredIngredients: normalizedIngredients(input.preferredIngredients, definitions),
      avoidedIngredients: normalizedIngredients(input.avoidedIngredients, definitions),
      customCandidates: cleanTextItems(input.customCandidates)
    };
  }

  function spiceRank(value, definitions) {
    if (value === 'any') return Infinity;
    var item = definitions.spice.find(function (definition) { return definition.value === value; });
    if (!item) throw new Error('请选择有效的最高辣度。');
    return item.rank;
  }

  function dishMatchesIngredient(dish, ingredient, definitions) {
    if (dish.primaryIngredients.indexOf(ingredient) >= 0 || dish.avoidTags.indexOf(ingredient) >= 0) return true;
    var definition = definitions.ingredients[ingredient];
    if (definition && definition.avoidTag && dish.avoidTags.indexOf(definition.avoidTag) >= 0) return true;
    var text = definition ? definition.label : ingredient;
    return dish.name.toLocaleLowerCase().indexOf(String(text).toLocaleLowerCase()) >= 0;
  }

  function filterCatalog(catalog, request, definitions, excludedIds) {
    var maximumSpice = spiceRank(request.maxSpice, definitions);
    return catalog.filter(function (dish) {
      if (excludedIds[dish.id] || dish.dining.indexOf(request.dining) < 0) return false;
      if (spiceRank(dish.spice, definitions) > maximumSpice) return false;
      if (request.dining === 'cook' && request.maxCookMinutes !== null && dish.cookMinutes > request.maxCookMinutes) return false;
      if (dish.course !== 'soup' && request.allowedStyles.indexOf(dish.style) < 0) return false;
      return !request.avoidedIngredients.some(function (ingredient) { return dishMatchesIngredient(dish, ingredient, definitions); });
    });
  }

  function menuLimits(count, soupCount) {
    var ordinary = count - soupCount;
    return {
      soupCount: soupCount,
      minHot: count === 1 ? 1 : count <= 3 ? count - 1 : Math.ceil(count * 0.6),
      maxCold: 1, maxWet: count <= 3 ? 1 : 2,
      minMain: count <= 3 ? 1 : Math.max(1, Math.ceil(ordinary * 0.4)),
      maxMain: count === 3 && soupCount ? 1 : count <= 3 ? ordinary : Math.max(1, Math.ceil(ordinary * 0.6)),
      minSide: count >= 3 ? 1 : 0,
      maxProteinRepeat: count <= 4 ? 1 : 2
    };
  }

  function emptyCounts() {
    return { meat: 0, vegetable: 0, main: 0, side: 0, soup: 0, hot: 0, cold: 0, wet: 0 };
  }

  function addDishCounts(counts, dish) {
    var next = Object.assign({}, counts);
    next[dish.diet === 'vegetarian' ? 'vegetable' : dish.diet] += 1;
    next[dish.role] += 1;
    if (dish.course !== dish.role) next[dish.course] += 1;
    if (dish.wet) next.wet += 1;
    return next;
  }

  function menuCounts(dishes) {
    return dishes.reduce(addDishCounts, emptyCounts());
  }

  function proteinGroups(dish, definitions) {
    return unique(dish.primaryIngredients.map(function (id) {
      return definitions.ingredients[id] && definitions.ingredients[id].proteinGroup;
    }).filter(Boolean));
  }

  function priceRange(dishes, dining) {
    return dishes.reduce(function (range, dish) {
      range[0] += dish.prices[dining][0]; range[1] += dish.prices[dining][1];
      return range;
    }, [0, 0]);
  }

  function finalMenuValid(dishes, request, target, limits, definitions, relaxProtein) {
    if (dishes.length !== request.dishCount) return false;
    var counts = menuCounts(dishes);
    if (counts.meat !== target.meat || counts.vegetable !== target.vegetable) return false;
    if (counts.soup !== limits.soupCount || counts.hot < limits.minHot || counts.cold > limits.maxCold || counts.wet > limits.maxWet) return false;
    if (counts.main < limits.minMain || counts.main > limits.maxMain || counts.side < limits.minSide) return false;
    if (!relaxProtein) {
      var proteins = Object.create(null);
      dishes.forEach(function (dish) {
        proteinGroups(dish, definitions).forEach(function (group) { proteins[group] = (proteins[group] || 0) + 1; });
      });
      if (Object.keys(proteins).some(function (group) { return proteins[group] > limits.maxProteinRepeat; })) return false;
    }
    var range = priceRange(dishes, request.dining);
    return request.budgetPerPerson === null || (range[0] + range[1]) / 2 <= request.budgetPerPerson * request.people;
  }

  function partialAllowed(state, dish, request, target, limits, previousPlans, maximumOverlap) {
    var counts = addDishCounts(state.counts, dish);
    var remaining = request.dishCount - state.dishes.length - 1;
    if (counts.meat > target.meat || counts.vegetable > target.vegetable || counts.soup > limits.soupCount) return false;
    if (counts.cold > limits.maxCold || counts.wet > limits.maxWet || counts.main > limits.maxMain) return false;
    if (counts.meat + remaining < target.meat || counts.vegetable + remaining < target.vegetable) return false;
    if (counts.soup + remaining < limits.soupCount || counts.hot + remaining < limits.minHot) return false;
    if (counts.main + remaining < limits.minMain || counts.side + remaining < limits.minSide) return false;
    var range = [state.price[0] + dish.prices[request.dining][0], state.price[1] + dish.prices[request.dining][1]];
    if (request.budgetPerPerson !== null && (range[0] + range[1]) / 2 > request.budgetPerPerson * request.people) return false;
    return previousPlans.every(function (plan) {
      var overlap = state.dishes.filter(function (item) { return plan.ids[item.id]; }).length + (plan.ids[dish.id] ? 1 : 0);
      return overlap <= maximumOverlap;
    });
  }

  function candidateScore(state, dish, request, definitions, previousPlans) {
    var covered = request.preferredIngredients.filter(function (ingredient) {
      return dishMatchesIngredient(dish, ingredient, definitions) && !state.covered[ingredient];
    }).length;
    var theme = request.theme !== 'any' && dish.themes.indexOf(request.theme) >= 0 ? 1 : 0;
    var proteins = proteinGroups(dish, definitions);
    var newProtein = proteins.some(function (group) { return !state.proteins[group]; }) ? 1 : 0;
    var newStyle = state.styles[dish.style] ? 0 : 1;
    var overlap = previousPlans.reduce(function (sum, plan) { return sum + (plan.ids[dish.id] ? 1 : 0); }, 0);
    var previousProtein = previousPlans.some(function (plan) {
      return proteins.some(function (group) { return plan.proteins && plan.proteins[group]; });
    });
    var previousStyle = previousPlans.some(function (plan) { return plan.styles && plan.styles[dish.style]; });
    return covered * 100 + theme * 30 + newProtein * 10 + newStyle * 5
      - overlap * 120 - (previousProtein ? 4 : 0) - (previousStyle ? 2 : 0);
  }

  function randomTieBreaker(id, seed) {
    var hash = seed >>> 0;
    for (var index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    return (hash >>> 0) / UINT32_RANGE / 1000;
  }

  function nextState(state, dish, request, definitions, previousPlans, tieBreakers) {
    var covered = Object.assign(Object.create(null), state.covered);
    request.preferredIngredients.forEach(function (ingredient) {
      if (dishMatchesIngredient(dish, ingredient, definitions)) covered[ingredient] = true;
    });
    var proteins = Object.assign(Object.create(null), state.proteins);
    proteinGroups(dish, definitions).forEach(function (group) { proteins[group] = (proteins[group] || 0) + 1; });
    var styles = Object.assign(Object.create(null), state.styles); styles[dish.style] = true;
    return {
      dishes: state.dishes.concat(dish), ids: Object.assign({}, state.ids, (function () { var item = {}; item[dish.id] = true; return item; }())),
      counts: addDishCounts(state.counts, dish), covered: covered, proteins: proteins, styles: styles,
      price: [state.price[0] + dish.prices[request.dining][0], state.price[1] + dish.prices[request.dining][1]],
      score: state.score + candidateScore(state, dish, request, definitions, previousPlans) + tieBreakers[dish.id]
    };
  }

  function buildMenu(candidates, request, target, soupCount, previousPlans, maximumOverlap, definitions, source, relaxProtein) {
    var limits = menuLimits(request.dishCount, soupCount);
    var seed = source();
    if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) throw new Error('随机源返回了无效数据。');
    var tieBreakers = candidates.reduce(function (values, dish) {
      values[dish.id] = randomTieBreaker(dish.id, seed);
      return values;
    }, Object.create(null));
    var initial = { dishes: [], ids: {}, counts: emptyCounts(), covered: {}, proteins: {}, styles: {}, price: [0, 0], score: 0 };
    var beam = [initial];
    var startDepth = 0;
    if (soupCount === 1) {
      beam = candidates.filter(function (dish) { return dish.course === 'soup'; }).filter(function (dish) {
        return partialAllowed(initial, dish, request, target, limits, previousPlans, maximumOverlap);
      }).map(function (dish) { return nextState(initial, dish, request, definitions, previousPlans, tieBreakers); });
      beam.sort(function (left, right) { return right.score - left.score; });
      beam = beam.slice(0, 10);
      startDepth = 1;
    }
    for (var depth = startDepth; depth < request.dishCount; depth += 1) {
      var expanded = [];
      beam.forEach(function (state) {
        candidates.forEach(function (dish) {
          if (state.ids[dish.id] || !partialAllowed(state, dish, request, target, limits, previousPlans, maximumOverlap)) return;
          expanded.push(nextState(state, dish, request, definitions, previousPlans, tieBreakers));
        });
      });
      expanded.sort(function (left, right) { return right.score - left.score; });
      var seen = Object.create(null);
      beam = expanded.filter(function (state) {
        var key = Object.keys(state.ids).sort().join('|');
        if (seen[key]) return false;
        seen[key] = true; return true;
      }).slice(0, 12);
      if (!beam.length) return null;
    }
    return beam.find(function (state) { return finalMenuValid(state.dishes, request, target, limits, definitions, relaxProtein); }) || null;
  }

  function planSummary(dishes, request, definitions) {
    var counts = menuCounts(dishes);
    var range = priceRange(dishes, request.dining);
    var covered = request.preferredIngredients.filter(function (ingredient) {
      return dishes.some(function (dish) { return dishMatchesIngredient(dish, ingredient, definitions); });
    });
    var matchCount = request.theme === 'any' ? 0 : dishes.filter(function (dish) { return dish.themes.indexOf(request.theme) >= 0; }).length;
    var structure = [];
    if (counts.main) structure.push(counts.main + ' 主菜');
    if (counts.side) structure.push(counts.side + ' 配菜');
    if (counts.hot) structure.push(counts.hot + ' 热菜');
    if (counts.cold) structure.push(counts.cold + ' 凉菜');
    if (counts.soup) structure.push(counts.soup + ' 汤');
    return Object.assign(counts, {
      meatCount: counts.meat, vegetableCount: counts.vegetable,
      mainCount: counts.main, sideCount: counts.side, soupCount: counts.soup,
      hotCount: counts.hot, coldCount: counts.cold, wetCount: counts.wet,
      priceRange: range, priceMidpoint: (range[0] + range[1]) / 2,
      perPersonRange: range.map(function (value) { return Math.round(value / request.people * 100) / 100; }),
      structureLabel: structure.join(' · '), themeMatchCount: matchCount, preferredIngredientsCovered: covered,
      preferredIngredientsMissing: request.preferredIngredients.filter(function (item) { return covered.indexOf(item) < 0; })
    });
  }

  function buildPlanNotice(summary, request, definitions, relaxedProtein) {
    var notices = [];
    if (request.theme !== 'any' && summary.themeMatchCount < request.dishCount) {
      var label = definitions.themes.find(function (item) { return item.value === request.theme; }).label;
      notices.push('本套有 ' + summary.themeMatchCount + ' 道符合“' + label + '”，其余菜用于满足荤素和菜单结构。');
    }
    if (summary.preferredIngredientsMissing.length) notices.push('未能覆盖全部想用食材，请查看菜单中的食材说明。');
    if (relaxedProtein) notices.push('候选有限，部分主要食材出现重复。');
    return notices;
  }

  function buildPlanReasons(summary, request, definitions) {
    var reasons = [];
    if (summary.preferredIngredientsCovered.length) reasons.push('优先用到 ' + summary.preferredIngredientsCovered.length + ' 种现有食材');
    if (request.theme !== 'any' && summary.themeMatchCount) {
      var theme = definitions.themes.find(function (item) { return item.value === request.theme; });
      reasons.push(summary.themeMatchCount + ' 道符合“' + theme.label + '”');
    }
    reasons.push(summary.structureLabel);
    return reasons;
  }

  function makePlan(state, request, index, definitions, relaxedProtein) {
    var summary = planSummary(state.dishes, request, definitions);
    return {
      id: 'plan-' + (index + 1), label: '方案 ' + String.fromCharCode(65 + index),
      dishes: state.dishes, summary: summary,
      reasons: buildPlanReasons(summary, request, definitions),
      notices: buildPlanNotice(summary, request, definitions, relaxedProtein)
    };
  }

  function selectedSoupCounts(request, source) {
    if (request.soupPolicy === 'none' || request.dishCount === 1) return [0];
    if (request.soupPolicy === 'required') return [1];
    return randomBelow(3, source) === 0 ? [1, 0] : [0, 1];
  }

  function tryBuildPlan(candidates, request, previousPlans, maximumOverlap, definitions, source) {
    var target = ratioTargets(request.dishCount, request.ratio);
    var soupCounts = selectedSoupCounts(request, source);
    for (var soupIndex = 0; soupIndex < soupCounts.length; soupIndex += 1) {
      var state = buildMenu(candidates, request, target, soupCounts[soupIndex], previousPlans, maximumOverlap, definitions, source, false);
      if (state) return { state: state, relaxedProtein: false };
      state = buildMenu(candidates, request, target, soupCounts[soupIndex], previousPlans, maximumOverlap, definitions, source, true);
      if (state) return { state: state, relaxedProtein: true };
    }
    return null;
  }

  function customDishId(name) {
    var hash = 2166136261;
    Array.from(name.toLocaleLowerCase()).forEach(function (character) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return 'custom-' + (hash >>> 0).toString(36);
  }

  function customDish(name) {
    return { id: customDishId(name), name: name, diet: 'custom', role: 'custom', course: 'custom', style: 'custom', themes: [], primaryIngredients: [] };
  }

  function drawCustomGroup(candidates, count, usage, source) {
    return shuffled(candidates, source).sort(function (left, right) {
      return (usage[customDishId(left)] || 0) - (usage[customDishId(right)] || 0);
    }).slice(0, count);
  }

  function planCustom(request, source, context) {
    if (request.customCandidates.length < request.dishCount) {
      return { status: 'insufficient', message: '自定义候选少于每组需要的菜数。', recoveries: [] };
    }
    var blocked = Object.create(null);
    (context.excludedDishIds || []).forEach(function (id) { blocked[id] = true; });
    var available = request.customCandidates.filter(function (name) { return !blocked[customDishId(name)]; });
    if (available.length < request.dishCount) {
      return {
        status: 'insufficient', message: '本轮未展示的自定义候选不足以再生成完整分组。',
        recoveries: [{ field: 'history', value: 'reset', label: '重置本轮记录' }]
      };
    }
    var plans = [];
    var usage = Object.create(null);
    for (var index = 0; index < 3; index += 1) {
      var names = drawCustomGroup(available, request.dishCount, usage, source);
      names.forEach(function (name) { var id = customDishId(name); usage[id] = (usage[id] || 0) + 1; });
      plans.push({ id: 'plan-' + (index + 1), label: '随机分组 ' + (index + 1), dishes: names.map(customDish), summary: { custom: true }, reasons: [], notices: ['自定义候选未进行荤素、结构、主题和预算判断。'] });
    }
    return { status: 'success', mode: 'custom', plans: plans, notices: [] };
  }

  function recoveryOptions(request, context, definitions) {
    var options = [];
    if (context.excludedDishIds && context.excludedDishIds.length) options.push({ field: 'history', value: 'reset', label: '重置本轮记录' });
    if (request.budgetPerPerson !== null) options.push({ field: 'budgetPerPerson', value: request.budgetPerPerson + 10, label: '人均预算提高至 ' + (request.budgetPerPerson + 10) + ' 元' });
    if (request.maxCookMinutes !== null) options.push({ field: 'maxCookMinutes', value: null, label: '取消耗时上限' });
    if (request.maxSpice !== 'any' && request.maxSpice !== 'hot') {
      var values = definitions.spice.map(function (item) { return item.value; });
      options.push({ field: 'maxSpice', value: values[values.indexOf(request.maxSpice) + 1], label: '提高最高可接受辣度' });
    }
    if (request.soupPolicy === 'required') options.push({ field: 'soupPolicy', value: 'optional', label: '改为汤品可选' });
    if (request.allowedStyles.length < definitions.styles.length) options.push({ field: 'allowedStyles', value: definitions.styles.map(function (item) { return item.value; }), label: '允许全部菜式' });
    return options;
  }

  function planBuiltin(catalog, request, context, definitions, source) {
    var excluded = Object.create(null);
    (context.excludedDishIds || []).forEach(function (id) { excluded[id] = true; });
    var candidates = filterCatalog(catalog, request, definitions, excluded);
    var plans = [];
    var maximumOverlap = Math.floor(request.dishCount / 3);
    for (var index = 0; index < 3; index += 1) {
      var strictPlans = plans.map(function (plan) {
        return {
          ids: plan.dishes.reduce(function (ids, dish) { ids[dish.id] = true; return ids; }, {}),
          proteins: plan.dishes.reduce(function (groups, dish) { proteinGroups(dish, definitions).forEach(function (group) { groups[group] = true; }); return groups; }, {}),
          styles: plan.dishes.reduce(function (styles, dish) { styles[dish.style] = true; return styles; }, {})
        };
      });
      var alreadyUsed = strictPlans.reduce(function (ids, plan) { Object.keys(plan.ids).forEach(function (id) { ids[id] = true; }); return ids; }, {});
      var strictCandidates = candidates.filter(function (dish) { return !alreadyUsed[dish.id]; });
      var built = tryBuildPlan(strictCandidates, request, strictPlans, 0, definitions, source);
      if (!built && maximumOverlap > 0) built = tryBuildPlan(candidates, request, strictPlans, maximumOverlap, definitions, source);
      if (!built) return { status: 'insufficient', message: '当前条件无法生成三套完整菜单。', recoveries: recoveryOptions(request, context, definitions) };
      var plan = makePlan(built.state, request, index, definitions, built.relaxedProtein);
      var repeated = plans.some(function (existing) { return plan.dishes.some(function (dish) { return existing.dishes.some(function (item) { return item.id === dish.id; }); }); });
      if (repeated) plan.notices.push('可选范围有限，本方案与其他方案有少量合规菜品重复。');
      plans.push(plan);
    }
    return { status: 'success', mode: 'builtin', plans: plans, notices: [], request: request };
  }

  function visibleDishIds(result, ignoredPlan, ignoredDish) {
    var ids = Object.create(null);
    result.plans.forEach(function (plan, planIndex) {
      plan.dishes.forEach(function (dish, dishIndex) {
        if (planIndex !== ignoredPlan || dishIndex !== ignoredDish) ids[dish.id] = true;
      });
    });
    return ids;
  }

  function replacementCandidates(catalog, request, oldDish, blocked, definitions) {
    var candidates = filterCatalog(catalog, request, definitions, blocked);
    return candidates.filter(function (dish) {
      return dish.diet === oldDish.diet && dish.role === oldDish.role
        && dish.course === oldDish.course && dish.wet === oldDish.wet;
    });
  }

  function replacementScore(dish, currentDishes, request, definitions) {
    var preferred = request.preferredIngredients.filter(function (ingredient) { return dishMatchesIngredient(dish, ingredient, definitions); }).length;
    var theme = request.theme !== 'any' && dish.themes.indexOf(request.theme) >= 0 ? 1 : 0;
    var otherDishes = currentDishes.filter(function (item) { return item.id !== dish.id; });
    var proteins = proteinGroups(dish, definitions);
    var proteinRepeated = otherDishes.some(function (item) {
      var groups = proteinGroups(item, definitions);
      return proteins.some(function (group) { return groups.indexOf(group) >= 0; });
    });
    var styleRepeated = otherDishes.some(function (item) { return item.style === dish.style; });
    return preferred * 100 + theme * 30 - (proteinRepeated ? 10 : 0) - (styleRepeated ? 5 : 0);
  }

  function replaceDish(catalog, definitions, source, request, result, target, context) {
    if (!result || result.status !== 'success' || !result.plans[target.planIndex] || !result.plans[target.planIndex].dishes[target.dishIndex]) throw new Error('请选择有效的待替换菜品。');
    var plan = result.plans[target.planIndex];
    var oldDish = plan.dishes[target.dishIndex];
    var blocked = visibleDishIds(result, target.planIndex, target.dishIndex);
    blocked[oldDish.id] = true;
    (context.excludedDishIds || []).forEach(function (id) { blocked[id] = true; });
    var candidates = replacementCandidates(catalog, request, oldDish, blocked, definitions);
    var limits = menuLimits(request.dishCount, plan.summary.soupCount);
    var targetCounts = ratioTargets(request.dishCount, request.ratio);
    var ranked = shuffled(candidates, source).sort(function (left, right) {
      return replacementScore(right, plan.dishes, request, definitions) - replacementScore(left, plan.dishes, request, definitions);
    });
    var replacement = ranked.find(function (dish) {
      var trial = plan.dishes.slice(); trial[target.dishIndex] = dish;
      return finalMenuValid(trial, request, targetCounts, limits, definitions, true);
    });
    if (!replacement) return { status: 'insufficient', message: '当前条件下没有可安全替换这道菜的候选。', recoveries: [] };
    var plans = result.plans.slice();
    var dishes = plan.dishes.slice(); dishes[target.dishIndex] = replacement;
    var summary = planSummary(dishes, request, definitions);
    plans[target.planIndex] = Object.assign({}, plan, {
      dishes: dishes, summary: summary,
      reasons: buildPlanReasons(summary, request, definitions),
      notices: buildPlanNotice(summary, request, definitions, false)
    });
    return Object.assign({}, result, { plans: plans, replacedDishId: oldDish.id, replacementDishId: replacement.id });
  }

  function createMealPlanner(options) {
    var settings = options || {};
    var catalog = settings.catalog || [];
    var definitions = settings.definitions || {};
    var source = settings.randomSource || secureRandomValue;
    validateCatalog(catalog, definitions);
    return {
      plan: function (request, context) {
        var normalized = normalizeRequest(request, definitions);
        return normalized.mode === 'custom' ? planCustom(normalized, source, context || {}) : planBuiltin(catalog, normalized, context || {}, definitions, source);
      },
      replace: function (request, result, target, context) {
        var normalized = normalizeRequest(request, definitions);
        if (normalized.mode === 'custom') throw new Error('自定义随机分组暂不支持单菜替换，请换一批。');
        return replaceDish(catalog, definitions, source, normalized, result, target, context || {});
      }
    };
  }

  return { createMealPlanner: createMealPlanner };
}));
