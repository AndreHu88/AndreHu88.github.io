(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackCommonSizesApp = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function displayNumber(value, digits) {
    return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits === undefined ? 4 : digits }).format(value);
  }

  function CommonSizesController(options) {
    this.page = options.page;
    this.form = options.form;
    this.result = options.result;
    this.data = options.data;
    this.escapeHtml = options.escapeHtml;
    this.setResult = options.setResult;
    this.setFormStatus = options.setFormStatus;
    this.selectedSizeId = 'cn-resident-id-photo';
    this.previousUnit = 'mm';
  }

  CommonSizesController.prototype.resultButton = function (item) {
    var selected = item.id === this.selectedSizeId;
    var dimensions = item.widthMm ? displayNumber(item.widthMm) + ' × ' + displayNumber(item.heightMm) + ' mm' : '数字规格 · ' + item.aspectRatio;
    var type = item.sourceType === 'official' ? '官方' : item.sourceType === 'standard' ? 'ISO' : '参考';
    return '<button type="button" role="option" data-size-id="' + this.escapeHtml(item.id) + '" aria-selected="' + selected + '" class="' + (selected ? 'is-active' : '') + '"><span><strong>' + this.escapeHtml(item.name) + '</strong><small>' + this.escapeHtml(dimensions) + '</small></span><em>' + type + '</em></button>';
  };

  CommonSizesController.prototype.renderResults = function () {
    var query = this.form.elements.sizeSearch.value;
    var category = this.form.elements.sizeCategory.value;
    var matches = this.data.searchSizes(query, category);
    var container = this.page.querySelector('[data-size-results]');
    container.innerHTML = matches.map(this.resultButton.bind(this)).join('');
    if (!matches.length) container.innerHTML = '<p class="size-reference-empty">没有找到匹配尺寸，请尝试名称、用途或其他分类。</p>';
    container.setAttribute('aria-label', '找到 ' + matches.length + ' 个尺寸');
  };

  CommonSizesController.prototype.detailHtml = function (item) {
    var typeLabel = item.sourceType === 'official' ? '官方用途规格' : item.sourceType === 'standard' ? '国际纸张标准' : '常见参考尺寸';
    var physical = item.widthMm ? displayNumber(item.widthMm) + ' × ' + displayNumber(item.heightMm) + ' mm' : '仅规定数字图像 ' + item.aspectRatio + ' 比例';
    var fixed = item.fixedPixels ? '<span>固定像素 <strong>' + item.fixedPixels.width + ' × ' + item.fixedPixels.height + ' px</strong></span>' : '';
    var range = item.pixelWidthRange ? '<span>图像宽度 <strong>' + item.pixelWidthRange[0] + '–' + item.pixelWidthRange[1] + ' px</strong></span>' : '';
    return '<div><span class="size-reference-type size-reference-type--' + item.sourceType + '">' + typeLabel + '</span><h3>' + this.escapeHtml(item.name) + '</h3><p>' + this.escapeHtml(item.purpose) + '</p></div><div class="size-reference-facts"><span>规格 <strong>' + this.escapeHtml(physical) + '</strong></span>' + fixed + range + '</div><p class="tool-result-note">' + this.escapeHtml(item.notice) + '</p><footer><small>核验日期：' + this.escapeHtml(item.verifiedAt) + '</small>' + this.sourceLinks(item, '查看来源') + '</footer>';
  };

  CommonSizesController.prototype.sourceLinks = function (item, prefix) {
    var links = [];
    if (item.sourceUrl) links.push('<a href="' + this.escapeHtml(item.sourceUrl) + '" target="_blank" rel="noopener">' + this.escapeHtml(prefix || item.sourceLabel) + '<span class="material-symbols-rounded">open_in_new</span></a>');
    if (item.secondarySourceUrl) links.push('<a href="' + this.escapeHtml(item.secondarySourceUrl) + '" target="_blank" rel="noopener">' + this.escapeHtml(prefix ? '补充指南' : item.secondarySourceLabel || '补充来源') + '<span class="material-symbols-rounded">open_in_new</span></a>');
    return links.join('');
  };

  CommonSizesController.prototype.selectSize = function (id) {
    var item = this.data.sizeById(id);
    if (!item) return;
    this.selectedSizeId = item.id;
    this.previousUnit = 'mm';
    this.form.elements.sizeUnit.value = 'mm';
    this.form.elements.sizeWidth.value = item.widthMm === null ? '' : item.widthMm;
    this.form.elements.sizeHeight.value = item.heightMm === null ? '' : item.heightMm;
    this.form.elements.dpi.value = item.defaultDpi || 300;
    this.page.querySelector('[data-size-detail]').innerHTML = this.detailHtml(item);
    this.renderResults();
    if (item.widthMm === null) this.setFormStatus('该官方指引只有数字图像比例和像素范围；如需排版，请另填实际冲印尺寸。', 'error');
    else this.setFormStatus('已载入“' + item.name + '”，可以换算像素或估算排版。', 'success');
  };

  CommonSizesController.prototype.populatePapers = function () {
    var select = this.form.elements.paperId;
    var papers = this.data.sizes.filter(function (item) { return item.category === 'paper'; });
    select.innerHTML = papers.map(function (item) {
      return '<option value="' + item.id + '"' + (item.name === 'A4' ? ' selected' : '') + '>' + item.name + '（' + item.widthMm + ' × ' + item.heightMm + ' mm）</option>';
    }).join('');
  };

  CommonSizesController.prototype.changeUnit = function () {
    var nextUnit = this.form.elements.sizeUnit.value;
    var width = Number(this.form.elements.sizeWidth.value);
    var height = Number(this.form.elements.sizeHeight.value);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      var converted = this.data.convertPhysicalSize({ width: width, height: height, unit: this.previousUnit, dpi: this.form.elements.dpi.value });
      var values = {
        mm: [converted.widthMm, converted.heightMm], cm: [converted.widthCm, converted.heightCm],
        in: [converted.widthInches, converted.heightInches], px: [converted.widthPixels, converted.heightPixels]
      }[nextUnit];
      this.form.elements.sizeWidth.value = displayNumber(values[0], 6).replace(/,/g, '');
      this.form.elements.sizeHeight.value = displayNumber(values[1], 6).replace(/,/g, '');
    }
    this.previousUnit = nextUnit;
  };

  CommonSizesController.prototype.conversion = function () {
    return this.data.convertPhysicalSize({
      width: this.form.elements.sizeWidth.value,
      height: this.form.elements.sizeHeight.value,
      unit: this.form.elements.sizeUnit.value,
      dpi: this.form.elements.dpi.value
    });
  };

  CommonSizesController.prototype.conversionHtml = function (converted, item) {
    var officialPixels = item && item.fixedPixels ? '<div><span>官方固定像素</span><strong>' + item.fixedPixels.width + ' × ' + item.fixedPixels.height + ' px</strong><small>不会被 DPI 换算结果覆盖</small></div>' : '';
    return '<div class="tool-summary-grid"><div><span>毫米</span><strong>' + displayNumber(converted.widthMm) + ' × ' + displayNumber(converted.heightMm) + ' mm</strong></div><div><span>厘米</span><strong>' + displayNumber(converted.widthCm) + ' × ' + displayNumber(converted.heightCm) + ' cm</strong></div><div><span>英寸</span><strong>' + displayNumber(converted.widthInches) + ' × ' + displayNumber(converted.heightInches) + ' in</strong></div><div><span>' + displayNumber(converted.dpi) + ' DPI 像素</span><strong>' + converted.widthPixels + ' × ' + converted.heightPixels + ' px</strong></div>' + officialPixels + '</div>';
  };

  CommonSizesController.prototype.layoutHtml = function (layout, paper) {
    if (!layout.count) return '<div class="tool-error"><span class="material-symbols-rounded">error</span><div><strong>无法排版</strong><p>' + this.escapeHtml(layout.message) + '</p></div></div>';
    var orientation = layout.paperOrientation === 'landscape' ? '横向' : '纵向';
    var arrangement = layout.rowGroups.map(function (group) { return group.rows + ' 行 × ' + group.columns + ' 张' + (group.itemRotated ? '（旋转）' : ''); }).join(' + ');
    var directionNote = layout.mixedOrientation ? '混合照片方向以获得更多数量。' : layout.itemRotated ? '已统一旋转照片以获得更多数量。' : '照片保持原方向。';
    return '<div class="size-layout-result"><div class="size-layout-visual"><span>' + layout.count + '</span><small>可完整排入</small></div><div class="tool-summary-grid"><div><span>目标纸张</span><strong>' + this.escapeHtml(paper.name) + ' · ' + orientation + '</strong></div><div><span>排列方式</span><strong>' + arrangement + '</strong></div><div><span>尺寸利用率</span><strong>' + displayNumber(layout.utilizationPercent, 2) + '%</strong></div><div><span>剩余高度</span><strong>' + displayNumber(layout.remainingHeightMm) + ' mm</strong></div></div></div><p class="tool-result-note">' + directionNote + ' 此结果不包含打印机不可打印边缘和裁切误差。</p>';
  };

  CommonSizesController.prototype.handle = function (action) {
    var errorElement = this.page.querySelector('[data-size-error]');
    errorElement.textContent = '';
    var converted;
    try { converted = this.conversion(); }
    catch (error) {
      errorElement.textContent = error.message || String(error);
      Array.prototype.forEach.call(this.form.querySelectorAll('input'), function (input) {
        if (input.validity && !input.validity.valid) input.setAttribute('aria-invalid', 'true');
      });
      throw error;
    }
    var item = this.data.sizeById(this.selectedSizeId);
    var html = this.conversionHtml(converted, item);
    var copy = (item ? item.name + '\n' : '') + displayNumber(converted.widthMm) + ' × ' + displayNumber(converted.heightMm) + ' mm\n' + converted.widthPixels + ' × ' + converted.heightPixels + ' px @ ' + displayNumber(converted.dpi) + ' DPI';
    if (action === 'layout') {
      var paper = this.data.sizeById(this.form.elements.paperId.value);
      var layout = this.data.estimatePrintLayout(converted, paper, {
        marginMm: Number(this.form.elements.marginMm.value), gapMm: Number(this.form.elements.gapMm.value),
        allowRotation: this.form.elements.allowRotation.checked, paperOrientation: this.form.elements.paperOrientation.value
      });
      html += this.layoutHtml(layout, paper);
      copy += '\n' + paper.name + '：' + layout.rowGroups.map(function (group) { return group.rows + ' 行 × ' + group.columns + ' 张' + (group.itemRotated ? '（旋转）' : ''); }).join(' + ') + '，共 ' + layout.count + ' 项';
    }
    if (item && item.sourceUrl) html += '<p class="size-source-note">数据来源：' + this.sourceLinks(item) + '</p>';
    this.setResult(html, copy);
  };

  CommonSizesController.prototype.initialize = function () {
    var controller = this;
    this.populatePapers();
    this.page.querySelector('[data-size-results]').addEventListener('click', function (event) {
      var button = event.target.closest('[data-size-id]');
      if (button) controller.selectSize(button.getAttribute('data-size-id'));
    });
    this.form.elements.sizeSearch.addEventListener('input', function () { controller.renderResults(); });
    this.form.elements.sizeCategory.addEventListener('change', function () { controller.renderResults(); });
    this.form.elements.sizeUnit.addEventListener('change', function () { controller.changeUnit(); });
    Array.prototype.forEach.call(this.page.querySelectorAll('[data-size-dpi]'), function (button) {
      button.addEventListener('click', function () {
        controller.form.elements.dpi.value = button.getAttribute('data-size-dpi');
        controller.setFormStatus('DPI 已更新为 ' + button.getAttribute('data-size-dpi') + '。', 'success');
      });
    });
    this.selectSize('cn-resident-id-photo');
  };

  CommonSizesController.prototype.reset = function () {
    this.selectedSizeId = 'cn-resident-id-photo';
    this.previousUnit = 'mm';
    this.selectSize(this.selectedSizeId);
  };

  function createCommonSizesApp(options) { return new CommonSizesController(options); }

  return { createCommonSizesApp: createCommonSizesApp };
}));
