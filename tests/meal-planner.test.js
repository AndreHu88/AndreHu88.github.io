const test = require('node:test');
const assert = require('node:assert/strict');

const mealData = require('../assets/js/meal-data.js');
const mealPlannerModule = require('../assets/js/meal-planner.js');
const { createMealPlanner } = mealPlannerModule;

const validThemes = new Set(['rice-friendly', 'light', 'quick', 'high-protein', 'banquet']);
const validStyles = new Set(['stir-fry', 'braised', 'steamed', 'stew', 'fried-grilled', 'cold']);

function defaultRequest(overrides = {}) {
  return {
    mode: 'builtin',
    people: 2,
    dishCount: 3,
    dining: 'cook',
    budgetPerPerson: 30,
    theme: 'rice-friendly',
    ratio: 'balanced',
    maxSpice: 'any',
    soupPolicy: 'optional',
    allowedStyles: [...validStyles],
    maxCookMinutes: null,
    preferredIngredients: [],
    avoidedIngredients: [],
    ...overrides
  };
}

test('规划模块只暴露创建器，实例只暴露规划与替换接口', () => {
  assert.deepEqual(Object.keys(mealPlannerModule), ['createMealPlanner']);
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  assert.deepEqual(Object.keys(planner), ['plan', 'replace']);
});

test('本地菜品目录提供至少 200 个完整且唯一的结构化正餐菜品', () => {
  const { dishes } = mealData;
  assert.ok(dishes.length >= 200);
  assert.equal(new Set(dishes.map((dish) => dish.id)).size, dishes.length);
  assert.equal(new Set(dishes.map((dish) => dish.name)).size, dishes.length);

  dishes.forEach((dish) => {
    assert.match(dish.id, /^[a-z0-9-]+$/);
    assert.ok(['meat', 'vegetarian'].includes(dish.diet), dish.name);
    assert.ok(['main', 'side', 'soup'].includes(dish.role), dish.name);
    assert.ok(['hot', 'cold', 'soup'].includes(dish.course), dish.name);
    assert.ok(validStyles.has(dish.style), dish.name);
    assert.ok(['none', 'mild', 'medium', 'hot'].includes(dish.spice), dish.name);
    assert.ok(dish.themes.length > 0 && dish.themes.every((theme) => validThemes.has(theme)), dish.name);
    assert.ok(dish.primaryIngredients.length > 0, dish.name);
    assert.ok(Array.isArray(dish.avoidTags), dish.name);
    assert.ok(dish.dining.length > 0, dish.name);
    ['cook', 'takeout', 'dine-in'].forEach((mode) => {
      assert.deepEqual(dish.prices[mode].length, 2, `${dish.name} ${mode}`);
      assert.ok(dish.prices[mode][0] > 0 && dish.prices[mode][1] >= dish.prices[mode][0], `${dish.name} ${mode}`);
    });
    assert.ok(Number.isInteger(dish.cookMinutes) && dish.cookMinutes > 0, dish.name);
    assert.ok(['easy', 'medium', 'hard'].includes(dish.difficulty), dish.name);
    if (dish.course === 'soup') assert.equal(dish.role, 'soup', dish.name);
  });

  validThemes.forEach((theme) => {
    const themed = dishes.filter((dish) => dish.themes.includes(theme));
    assert.ok(themed.some((dish) => dish.diet === 'meat'), `${theme} 缺少荤食`);
    assert.ok(themed.some((dish) => dish.diet === 'vegetarian'), `${theme} 缺少素食`);
    assert.ok(new Set(themed.map((dish) => dish.style)).size >= 3, `${theme} 菜式过少`);
    assert.ok(Math.max(...themed.map((dish) => dish.prices.cook[1])) - Math.min(...themed.map((dish) => dish.prices.cook[0])) >= 20, `${theme} 价格层级不足`);
  });
  assert.ok(dishes.some((dish) => dish.course === 'soup' && dish.diet === 'meat'));
  assert.ok(dishes.some((dish) => dish.course === 'soup' && dish.diet === 'vegetarian'));
  assert.ok(dishes.filter((dish) => dish.themes.includes('rice-friendly')).some((dish) => dish.spice === 'none'));
  dishes.forEach((dish) => dish.primaryIngredients.forEach((ingredient) => {
    assert.ok(mealData.definitions.ingredients[ingredient], `${dish.name} 的食材 ${ingredient} 未注册`);
  }));
});

test('默认请求生成三套完整、不重复、预算内且偏向家常下饭的菜单', () => {
  const planner = createMealPlanner({
    catalog: mealData.dishes,
    definitions: mealData.definitions,
    randomSource: () => 0
  });
  const result = planner.plan(defaultRequest(), { excludedDishIds: [] });

  assert.equal(result.status, 'success');
  assert.equal(result.plans.length, 3);
  const allIds = result.plans.flatMap((plan) => plan.dishes.map((dish) => dish.id));
  assert.equal(new Set(allIds).size, 9);
  result.plans.forEach((plan) => {
    assert.equal(plan.dishes.length, 3);
    assert.equal(plan.summary.meatCount, 1);
    assert.equal(plan.summary.vegetableCount, 2);
    assert.ok(plan.summary.hotCount >= 2);
    assert.ok(plan.summary.mainCount >= 1);
    assert.ok(plan.summary.sideCount >= 1);
    assert.ok(plan.summary.priceMidpoint <= 60);
    assert.ok(plan.summary.themeMatchCount >= 1);
  });
});

test('现有食材优先于主题，最高辣度按可接受上限过滤', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const result = planner.plan(defaultRequest({
    budgetPerPerson: 60,
    preferredIngredients: ['西兰花'],
    maxSpice: 'mild'
  }), { excludedDishIds: [] });

  assert.equal(result.status, 'success');
  result.plans.forEach((plan) => {
    assert.ok(plan.summary.preferredIngredientsCovered.includes('broccoli'));
    assert.ok(plan.dishes.some((dish) => dish.primaryIngredients.includes('broccoli')));
    assert.ok(plan.dishes.every((dish) => ['none', 'mild'].includes(dish.spice)));
    assert.ok(plan.dishes.some((dish) => dish.spice === 'none'));
  });
});

test('自定义候选生成三组完整名单并明确不应用智能结构', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const result = planner.plan(defaultRequest({
    mode: 'custom',
    customCandidates: '番茄炒蛋\n青椒肉丝\n清炒时蔬\n清蒸鲈鱼\n凉拌黄瓜\n红烧豆腐',
    dishCount: 3
  }), { excludedDishIds: [] });

  assert.equal(result.status, 'success');
  assert.equal(result.mode, 'custom');
  assert.equal(result.plans.length, 3);
  result.plans.forEach((plan) => {
    assert.equal(plan.dishes.length, 3);
    assert.equal(new Set(plan.dishes.map((dish) => dish.name)).size, 3);
    assert.match(plan.notices.join(''), /未进行荤素、结构、主题和预算判断/);
  });
});

test('无法生成三套菜单时返回恢复建议而不是残缺方案', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const result = planner.plan(defaultRequest({
    budgetPerPerson: 1,
    maxCookMinutes: 10,
    soupPolicy: 'required',
    allowedStyles: ['steamed']
  }), { excludedDishIds: ['pepper-pork-shreds'] });

  assert.equal(result.status, 'insufficient');
  assert.equal(result.plans, undefined);
  assert.match(result.message, /无法生成三套完整菜单/);
  assert.ok(result.recoveries.some((item) => item.field === 'budgetPerPerson'));
  assert.ok(result.recoveries.some((item) => item.field === 'maxCookMinutes'));
  assert.ok(result.recoveries.some((item) => item.field === 'history'));
  assert.ok(result.recoveries.every((item) => item.field !== 'avoidedIngredients'));
});

test('逐道换菜保持菜单硬条件并避开当前三套可见菜品', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const request = defaultRequest({ budgetPerPerson: 60, soupPolicy: 'none' });
  const original = planner.plan(request, { excludedDishIds: [] });
  const visibleBefore = new Set(original.plans.flatMap((plan) => plan.dishes.map((dish) => dish.id)));
  const oldDish = original.plans[0].dishes[0];
  const replaced = planner.replace(request, original, { planIndex: 0, dishIndex: 0 }, { excludedDishIds: [] });

  assert.equal(replaced.status, 'success');
  const updated = replaced.plans[0];
  assert.equal(updated.dishes.length, 3);
  assert.equal(updated.summary.meatCount, original.plans[0].summary.meatCount);
  assert.equal(updated.summary.vegetableCount, original.plans[0].summary.vegetableCount);
  assert.equal(updated.summary.soupCount, 0);
  assert.ok(updated.summary.mainCount >= 1 && updated.summary.sideCount >= 1);
  assert.ok(updated.summary.priceMidpoint <= 120);
  assert.notEqual(updated.dishes[0].id, oldDish.id);
  assert.ok(!visibleBefore.has(updated.dishes[0].id));
  assert.equal(updated.dishes[0].diet, oldDish.diet);
  assert.equal(updated.dishes[0].role, oldDish.role);
  assert.equal(updated.dishes[0].course, oldDish.course);
  assert.equal(updated.dishes[0].wet, oldDish.wet);
});

test('固定汤和不同菜数遵循主配菜、冷热与汤水结构', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const single = planner.plan(defaultRequest({ people: 1, dishCount: 1, budgetPerPerson: 80, soupPolicy: 'optional' }), {});
  assert.equal(single.status, 'success');
  single.plans.forEach((plan) => {
    assert.equal(plan.summary.mainCount, 1);
    assert.equal(plan.summary.soupCount, 0);
    assert.equal(plan.summary.hotCount, 1);
  });

  const four = planner.plan(defaultRequest({ people: 6, dishCount: 4, budgetPerPerson: 100, theme: 'any', soupPolicy: 'required' }), {});
  assert.equal(four.status, 'success');
  four.plans.forEach((plan) => {
    assert.equal(plan.summary.soupCount, 1);
    assert.equal(plan.summary.mainCount, 2);
    assert.equal(plan.summary.sideCount, 1);
    assert.ok(plan.summary.hotCount >= 3);
    assert.ok(plan.summary.coldCount <= 1);
    assert.ok(plan.summary.wetCount <= 2);
  });
});

test('菜式、忌口、全素和自己做耗时均作为硬条件', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const result = planner.plan(defaultRequest({
    people: 4,
    budgetPerPerson: 100,
    ratio: 'all-vegetarian',
    soupPolicy: 'none',
    allowedStyles: ['stir-fry'],
    maxCookMinutes: 20,
    avoidedIngredients: ['海鲜']
  }), {});

  assert.equal(result.status, 'success');
  result.plans.flatMap((plan) => plan.dishes).forEach((dish) => {
    assert.equal(dish.diet, 'vegetarian');
    assert.equal(dish.style, 'stir-fry');
    assert.ok(dish.cookMinutes <= 20);
    assert.ok(!dish.avoidTags.includes('seafood'));
  });
});

test('候选有限时按每两套最多一道的规则受控复用', () => {
  const selectedIds = [
    'pepper-pork-shreds', 'celery-beef', 'scallion-lamb',
    'seasonal-greens', 'garlic-broccoli', 'oyster-lettuce'
  ];
  const catalog = mealData.dishes.filter((dish) => selectedIds.includes(dish.id));
  const planner = createMealPlanner({ catalog, definitions: mealData.definitions, randomSource: () => 0 });
  const result = planner.plan(defaultRequest({ people: 4, budgetPerPerson: 100, theme: 'any', soupPolicy: 'none', allowedStyles: ['stir-fry'] }), {});

  assert.equal(result.status, 'success');
  const sets = result.plans.map((plan) => new Set(plan.dishes.map((dish) => dish.id)));
  for (let left = 0; left < sets.length; left += 1) {
    for (let right = left + 1; right < sets.length; right += 1) {
      assert.ok([...sets[left]].filter((id) => sets[right].has(id)).length <= 1);
    }
  }
  assert.ok(new Set(result.plans.flatMap((plan) => plan.dishes.map((dish) => dish.id))).size < 9);
});

test('自定义候选跨组均匀复用，并在会话历史耗尽后提示重置', () => {
  const planner = createMealPlanner({ catalog: mealData.dishes, definitions: mealData.definitions, randomSource: () => 0 });
  const request = defaultRequest({ mode: 'custom', dishCount: 3, customCandidates: '甲\n乙\n丙\n丁\n戊\n己' });
  const first = planner.plan(request, { excludedDishIds: [] });
  const counts = first.plans.flatMap((plan) => plan.dishes).reduce((usage, dish) => {
    usage[dish.id] = (usage[dish.id] || 0) + 1;
    return usage;
  }, {});

  assert.equal(first.status, 'success');
  assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1);
  const exhausted = planner.plan(request, { excludedDishIds: Object.keys(counts) });
  assert.equal(exhausted.status, 'insufficient');
  assert.deepEqual(exhausted.recoveries.map((item) => item.field), ['history']);
});

test('大份菜单使用有界搜索且不会在每次候选扩展时读取随机源', () => {
  let randomReads = 0;
  const planner = createMealPlanner({
    catalog: mealData.dishes,
    definitions: mealData.definitions,
    randomSource: () => { randomReads += 1; return 0; }
  });
  const startedAt = performance.now();
  const result = planner.plan(defaultRequest({
    people: 12,
    dishCount: 20,
    budgetPerPerson: 1000,
    theme: 'any',
    soupPolicy: 'optional'
  }), {});

  assert.equal(result.status, 'success');
  assert.ok(performance.now() - startedAt < 3500, '20 道菜规划不应长时间阻塞主线程');
  assert.ok(randomReads < 30, `随机源读取次数过多：${randomReads}`);
});
