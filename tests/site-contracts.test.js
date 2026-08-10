const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
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
  const forms = readProjectFile('_includes/tool-form.html');
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
