const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('今天吃什么表单聚焦正餐规划并提供完整的渐进式设置', () => {
  const form = readProjectFile('_includes/tool-forms/fun.html');
  [
    'mode', 'people', 'dishCount', 'dining', 'budgetPerPerson', 'ratio',
    'maxSpice', 'soupPolicy', 'maxCookMinutes', 'customCandidates'
  ].forEach((name) => assert.match(form, new RegExp(`name="${name}"`), `missing ${name}`));

  [
    'data-meal-theme-options', 'data-meal-advanced', 'data-meal-style-options',
    'data-meal-ingredient-list="preferred"', 'data-meal-ingredient-list="avoided"',
    'data-add-meal-ingredient', 'data-meal-custom', 'data-meal-history-status'
  ].forEach((attribute) => assert.match(form, new RegExp(attribute), `missing ${attribute}`));

  assert.doesNotMatch(form, /name="mealTime"|name="diet"|name="spice"/);
  assert.match(form, /value="cook" selected/);
  assert.match(form, /name="people"[^>]*value="2"/);
  assert.match(form, /name="dishCount"[^>]*value="3"/);
  assert.match(form, /name="budgetPerPerson"[^>]*value="30"/);
  assert.match(form, /生成三套菜单/);
});

test('主题、菜式和食材候选由共享定义动态渲染', () => {
  const form = readProjectFile('_includes/tool-forms/fun.html');
  const app = readProjectFile('assets/js/meal-app.js');
  const data = readProjectFile('assets/js/meal-data.js');

  assert.doesNotMatch(form, /家常下饭|清淡少油|快手省事|高蛋白|宴客硬菜/);
  assert.match(app, /definitions\.themes/);
  assert.match(app, /definitions\.styles/);
  assert.match(app, /definitions\.ingredients/);
  ['rice-friendly', 'light', 'quick', 'high-protein', 'banquet'].forEach((theme) => {
    assert.match(data, new RegExp(`value: '${theme}'`));
  });
});

test('页面按数据、规划器、交互适配层和通用脚本的顺序加载', () => {
  const tools = readProjectFile('_data/tools.yml');
  const layout = readProjectFile('_layouts/tool.html');

  assert.match(tools, /slug: meal-picker[\s\S]*?pre_scripts:\n\s+- meal-data\n\s+- meal-planner\n\s+- meal-app/);
  assert.match(layout, /for pre_script in tool\.pre_scripts/);
  assert.ok(layout.indexOf('tool.extra_script') < layout.indexOf('for pre_script in tool.pre_scripts'));
  assert.ok(layout.indexOf('for pre_script in tool.pre_scripts') < layout.indexOf('tool-{{ tool_module }}.js'));
  assert.ok(layout.indexOf('tool-{{ tool_module }}.js') < layout.indexOf('tool-app.js'));
});

test('DOM 适配层支持三方案切换、逐道换菜、复制和快捷恢复', () => {
  const app = readProjectFile('assets/js/meal-app.js');
  [
    'meal-plan-grid', 'meal-plan-tabs', 'data-select-meal-plan', 'data-meal-plan-card', 'data-replace-meal',
    'data-copy-meal-plan', 'data-meal-recovery', 'reset-history'
  ].forEach((contract) => assert.match(app, new RegExp(contract), `missing ${contract}`));
  assert.match(app, /planner\.plan\(/);
  assert.match(app, /planner\.replace\(/);
  assert.match(app, /条件已变化，推荐历史已重置/);
  assert.match(app, /data-meal-advanced[^\n]*open = true/);
  assert.match(app, /escapedIngredientLabels\(plan\.summary\.preferredIngredientsMissing\)/);
  assert.match(app, /为什么推荐这套/);
});

test('菜单规划功能保持完全本地并只使用安全随机源', () => {
  const sources = ['assets/js/meal-data.js', 'assets/js/meal-planner.js', 'assets/js/meal-app.js']
    .map(readProjectFile).join('\n');
  assert.doesNotMatch(sources, /Math\.random\s*\(/);
  assert.doesNotMatch(sources, /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest/);
  assert.match(sources, /crypto\.getRandomValues/);
});

test('专用布局使用单方案聚焦查看并让菜品响应式排列', () => {
  const styles = readProjectFile('style.scss');
  assert.match(styles, /data-tool="meal-picker"[\s\S]*?\.tool-workspace\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /\.meal-plan-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
  assert.match(styles, /\.meal-plan-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.meal-plan-card\s*>\s*ol\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
  assert.match(styles, /@media \(max-width:\s*1100px\)[\s\S]*?\.meal-plan-card\s*>\s*ol\s*\{[^}]*repeat\(2,/);
  assert.match(styles, /@media \(max-width:\s*700px\)[\s\S]*?\.meal-plan-card\s*>\s*ol\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.tool-form\s+\.meal-theme-card\s*\{[^}]*min-height:\s*54px[^}]*align-items:\s*center/);
});

test('旧版单菜单算法已从趣味工具核心移除', () => {
  const core = require('../assets/js/tool-fun.js');
  assert.equal(core.pickMeal, undefined);
  assert.equal(core.mealCatalog, undefined);
  ['secureRandomBelow', 'secureShuffle', 'randomPick', 'rollDice', 'randomIntegers', 'qrPayload']
    .forEach((name) => assert.equal(typeof core[name], 'function', name));
});
