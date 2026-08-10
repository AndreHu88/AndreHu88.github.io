const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function flatYamlRecords(relativePath, recordKey) {
  const source = readProjectFile(relativePath);
  const records = [];
  let current = null;
  source.split(/\r?\n/).forEach((line) => {
    const recordMatch = line.match(new RegExp(`^- ${recordKey}:\\s*(.+)$`));
    if (recordMatch) {
      current = { [recordKey]: recordMatch[1].trim() };
      records.push(current);
      return;
    }
    const fieldMatch = current && line.match(/^  ([a-z_]+):\s*(.*)$/);
    if (fieldMatch) current[fieldMatch[1]] = fieldMatch[2].trim();
  });
  return records;
}

test('desktop navigation exposes article destinations without a drawer', () => {
  const header = readProjectFile('_includes/site-header.html');
  [
    ['/#latest', '最新文章'],
    ['/archive/', '时间归档'],
    ['/tags/', '全部标签'],
    ['/tools/', '工具'],
    ['/book/', '知识库'],
    ['/about/', '关于']
  ].forEach(([href, label]) => {
    assert.match(header, new RegExp('href="\\{\\{ site\\.baseurl \\}\\}' + href.replace('/', '\\/') + '">' + label + '<'));
  });
  assert.doesNotMatch(header, /data-nav-trigger|data-nav-popover|article-popover/);
  assert.match(header, /active_section == 'tools'/);
  assert.doesNotMatch(header, /nav-link--library/);
  assert.doesNotMatch(readProjectFile('assets/js/site.js'), /setArticleMenu|data-nav-trigger|data-nav-popover/);
});

test('timestamp current-time action bypasses empty required input validation', () => {
  const forms = readProjectFile('_includes/tool-forms/developer.html');
  assert.match(forms, /value="now"[^>]*formnovalidate/);
});

test('article cards support explicit and tag-based local covers', () => {
  const home = readProjectFile('index.html');
  const coverData = readProjectFile('_data/post_covers.yml');
  assert.match(home, /post\.cover/);
  assert.match(home, /site\.data\.post_covers/);
  assert.doesNotMatch(home, /article-card__media-link--plain/);
  ['金融', '读书笔记', '随笔', 'iOS', 'Linux', 'Java', '数据结构', '工具'].forEach((tag) => {
    assert.match(coverData, new RegExp('- ' + tag));
  });
});

test('tool metadata contains exactly 32 unique tools in the five planned categories', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const categories = flatYamlRecords('_data/tool_categories.yml', 'id');
  assert.equal(tools.length, 32);
  assert.equal(new Set(tools.map((tool) => tool.slug)).size, 32);
  assert.deepEqual(categories.map((category) => category.id), ['text', 'developer', 'finance', 'life', 'fun']);

  const counts = tools.reduce((result, tool) => {
    result[tool.category] = (result[tool.category] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { text: 6, developer: 4, finance: 10, life: 9, fun: 3 });
  tools.forEach((tool) => {
    ['title', 'category', 'category_name', 'icon', 'summary', 'keywords'].forEach((field) => {
      assert.ok(tool[field], `${tool.slug} is missing ${field}`);
    });
  });
  assert.deepEqual(tools.filter((tool) => tool.networked === 'true').map((tool) => tool.slug), ['exchange-rate']);
  assert.deepEqual(tools.filter((tool) => tool.extra_script).map((tool) => tool.slug), ['qr-generator']);
  assert.equal(tools.some((tool) => Object.prototype.hasOwnProperty.call(tool, 'featured')), false);
});

test('every tool metadata record has a matching route page', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const expectedPages = new Set(tools.map((tool) => `${tool.slug}.html`));
  const actualPages = new Set(fs.readdirSync(path.join(projectRoot, 'tools')).filter((file) => file.endsWith('.html') && file !== 'index.html'));
  assert.deepEqual(actualPages, expectedPages);

  tools.forEach((tool) => {
    const page = readProjectFile(`tools/${tool.slug}.html`);
    assert.match(page, new RegExp(`^---\\n[\\s\\S]*?tool: ${tool.slug}\\n[\\s\\S]*?permalink: /tools/${tool.slug}/\\n---`), `${tool.slug} page front matter does not match metadata`);
  });
});

test('category dispatcher and forms cover every tool slug', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const formDispatcher = readProjectFile('_includes/tool-form.html');
  ['text', 'developer', 'finance', 'life', 'fun'].forEach((category) => {
    assert.match(formDispatcher, new RegExp(`include tool-forms/${category}\\.html`));
    const categoryForm = readProjectFile(`_includes/tool-forms/${category}.html`);
    tools.filter((tool) => tool.category === category).forEach((tool) => {
      assert.match(categoryForm, new RegExp(`(?:include\\.tool\\.slug ==|when) '${tool.slug}'`), `${tool.slug} has no form branch`);
    });
  });
});

test('tool application uses a complete explicit handler registry', () => {
  const tools = flatYamlRecords('_data/tools.yml', 'slug');
  const app = readProjectFile('assets/js/tool-app.js');
  assert.match(app, /var toolHandlers\s*=\s*\{/);
  tools.forEach((tool) => {
    assert.match(app, new RegExp(`['"]${tool.slug}['"]\\s*:`), `${tool.slug} has no registered handler`);
  });
  assert.doesNotMatch(app, /if \(tool === ['"][^'"]+['"]\)[\s\S]{0,80}else if \(tool ===/);
});

test('tool layout loads category modules, optional local scripts and privacy notices', () => {
  const layout = readProjectFile('_layouts/tool.html');
  assert.match(layout, /tool-\{\{ tool\.category \}\}\.js/);
  assert.match(layout, /assets\/js\/vendor\/\{\{ tool\.extra_script \}\}\.js/);
  assert.match(layout, /if tool\.networked/);
  assert.match(layout, /输入金额不会发送或保存/);
  assert.match(layout, /tool\.slug == 'bmi'/);
  assert.match(readProjectFile('assets/js/vendor/qrcode-generator.LICENSE'), /MIT License|Licensed under the MIT license/i);
});

test('tools hub provides data-driven categories, search, filtering and local-first copy', () => {
  const hub = readProjectFile('tools/index.html');
  assert.match(hub, /site\.data\.tool_categories/);
  assert.match(hub, /data-tool-search-input/);
  assert.match(hub, /data-tool-filter=/);
  assert.match(hub, /data-tool-filter-status/);
  assert.match(hub, /data-tools-empty/);
  assert.match(hub, /32 个工具/);
  assert.match(hub, /大多数工具完全在浏览器本地运行/);
  assert.match(hub, /汇率工具仅联网请求币种对应的最新参考汇率/);
  const behavior = readProjectFile('assets/js/tools-hub.js');
  assert.match(behavior, /data-tool-search-input/);
  assert.match(behavior, /data-tool-filter/);
  assert.match(behavior, /data-tools-clear/);
  assert.match(behavior, /scrollIntoView/);
  const styles = readProjectFile('style.scss');
  assert.match(styles, /\.tool-category[^}]*scroll-margin-top/);
  assert.match(styles, /\.tools-hub \[hidden\][^}]*display: none !important/);
});
