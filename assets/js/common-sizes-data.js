(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JackCommonSizes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var verifiedAt = '2026-08-11';
  var sources = {
    iso216: { label: 'ISO 216:2007', url: 'https://www.iso.org/standard/36631.html' },
    residentId: { label: 'GA/T 461—2019 居民身份证制证用数字相片技术要求', url: 'https://std.samr.gov.cn/hb/search/stdHBDetailedCNF?id=D7B62896ECF688F0E05397BE0A0A4846' },
    residentGuide: { label: '湖南省居民身份证相片采集指南', url: 'https://zwfw-new.hunan.gov.cn/hnzwfw/1/186/196/277/43191/43192/index_3.htm' },
    driverGuide: { label: '上海市驾驶证照片办事指南', url: 'https://zwdt.sh.gov.cn/govPortals/bsfw/item/732b9abb-effc-40f9-ab74-be1509165df9' },
    entryExit: { label: '国家移民管理局出入境证件相片提交指引', url: 'https://s.nia.gov.cn/mps/bszy/qcwbzpzy/zpzy/202405/t20240528_1001.html' },
    foreignerVisa: { label: '国家移民管理局外国人签证证件办事指南', url: 'https://www.nia.gov.cn/n741440/n741542/c1637910/part/1637927.pdf' },
    commonSmallOne: { label: '无锡市驾驶证照片尺寸示例', url: 'https://www.wuxi.gov.cn/doc/2025/05/23/4627485.shtml' },
    commonOne: { label: '广东省人事考试照片尺寸示例', url: 'https://rsks.gd.gov.cn/wsbs/zyjsryzgks/2018/2018fyzyzg_05/content/post_1131463.html' },
    commonSmallTwo: { label: '国家体育总局签证照片尺寸示例', url: 'https://www.sport.gov.cn/n322/n385/n436/c921552/content.html' },
    commonTwo: { label: '湖南省招聘照片尺寸示例', url: 'https://ggzy.hunan.gov.cn/ggzy/xxgk/xxgkml/tzgg/202606/t20260601_33991496.html' },
    commonLargeTwo: { label: '政务服务平台照片数据示例', url: 'https://www.hunan.gov.cn/zqt/zcsd/202604/33949051/files/26e32761db574c53a5c3f72b9aea715f.pdf' },
    photoPrint: { label: '爱普生照片打印尺寸参考', url: 'https://www2.epson.jp/support/manual/data/ink/pm3500c/4014332_00.PDF' }
  };

  function officialSize(record) {
    return Object.assign({ category: 'official', sourceType: 'official', verifiedAt: verifiedAt }, record);
  }

  var officialSizes = [
    officialSize({
      id: 'cn-resident-id-photo', name: '居民身份证制证相片', aliases: ['身份证照片', '身份证证件照'],
      purpose: '中华人民共和国居民身份证制证', widthMm: 26, heightMm: 32, defaultDpi: 350,
      fixedPixels: { width: 358, height: 441 }, sourceLabel: sources.residentId.label,
      sourceUrl: sources.residentId.url, secondarySourceLabel: sources.residentGuide.label, secondarySourceUrl: sources.residentGuide.url,
      notice: '制证相片还包含头像位置、背景和文件格式要求，请以采集机构要求为准。'
    }),
    officialSize({
      id: 'cn-driver-license-photo', name: '机动车驾驶证相片', aliases: ['驾驶证照片', '驾照照片'],
      purpose: '机动车驾驶证业务', widthMm: 22, heightMm: 32, defaultDpi: 300,
      sourceLabel: sources.driverGuide.label, sourceUrl: sources.driverGuide.url,
      notice: '电子照片分辨率应不低于办事指南要求，背景和头像位置也需同时满足规定。'
    }),
    officialSize({
      id: 'cn-entry-exit-online-photo', name: '出入境证件在线相片', aliases: ['护照在线照片', '出入境照片'],
      purpose: '国家移民管理局政务服务平台在线提交', widthMm: null, heightMm: null, defaultDpi: null,
      aspectRatio: '3:4', pixelWidthRange: [400, 1000], sourceLabel: sources.entryExit.label, sourceUrl: sources.entryExit.url,
      notice: '该指引规定数字图像比例和像素范围，不提供可直接用于冲印排版的物理尺寸。'
    }),
    officialSize({
      id: 'cn-foreigner-visa-photo', name: '外国人签证证件相片', aliases: ['外国人居留证照片', '签证照片'],
      purpose: '外国人签证证件及居留许可业务', widthMm: 33, heightMm: 48, defaultDpi: 300,
      sourceLabel: sources.foreignerVisa.label, sourceUrl: sources.foreignerVisa.url,
      notice: '实际受理还会检查背景、头像大小和拍摄时间等要求。'
    })
  ];

  function commonPhoto(id, name, widthMm, heightMm, aliases, source) {
    return {
      id: id, name: name, aliases: aliases || [], category: 'photo', sourceType: 'common',
      purpose: '日常证件照或照片冲印参考', widthMm: widthMm, heightMm: heightMm, defaultDpi: 300,
      sourceLabel: source.label, sourceUrl: source.url, verifiedAt: verifiedAt,
      notice: '常见参考尺寸，不代表任何具体证件的受理标准。'
    };
  }

  var photoSizes = [
    commonPhoto('common-small-one-inch', '小一寸', 22, 32, ['一寸小照'], sources.commonSmallOne),
    commonPhoto('common-one-inch', '一寸', 25, 35, ['1寸', '一英寸证件照'], sources.commonOne),
    commonPhoto('common-large-one-inch', '大一寸', 33, 48, ['大1寸'], sources.foreignerVisa),
    commonPhoto('common-small-two-inch', '小二寸', 35, 45, ['小2寸'], sources.commonSmallTwo),
    commonPhoto('common-two-inch', '二寸', 35, 49, ['2寸'], sources.commonTwo),
    commonPhoto('common-large-two-inch', '大二寸', 35, 53, ['大2寸'], sources.commonLargeTwo),
    commonPhoto('photo-2x3', '2 × 3 英寸', 50.8, 76.2, ['2R', '钱包照', '冲印'], sources.photoPrint),
    commonPhoto('photo-l', 'L 尺寸（3.5 × 5 英寸）', 88.9, 127, ['3.5x5', '冲印'], sources.photoPrint),
    commonPhoto('photo-4x6', '4 × 6 英寸', 101.6, 152.4, ['4R', '六寸照片', '冲印'], sources.photoPrint),
    commonPhoto('photo-5x7', '5 × 7 英寸', 127, 177.8, ['5R', '七寸照片', '冲印'], sources.photoPrint),
    commonPhoto('photo-6x8', '6 × 8 英寸', 152.4, 203.2, ['6R', '八寸照片', '冲印'], sources.photoPrint),
    commonPhoto('photo-8x10', '8 × 10 英寸', 203.2, 254, ['8R', '十寸照片', '冲印'], sources.photoPrint),
    commonPhoto('photo-10x12', '10 × 12 英寸', 254, 304.8, ['12寸照片', '冲印'], sources.photoPrint)
  ];

  var paperDimensions = {
    A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210],
    A6: [105, 148], A7: [74, 105], A8: [52, 74], A9: [37, 52], A10: [26, 37],
    B0: [1000, 1414], B1: [707, 1000], B2: [500, 707], B3: [353, 500], B4: [250, 353], B5: [176, 250],
    B6: [125, 176], B7: [88, 125], B8: [62, 88], B9: [44, 62], B10: [31, 44]
  };

  var paperSizes = Object.keys(paperDimensions).map(function (name) {
    return {
      id: 'iso-' + name.toLowerCase(), name: name, aliases: ['ISO ' + name, name + '纸'], category: 'paper', sourceType: 'standard',
      purpose: '办公、书写与印刷用纸', widthMm: paperDimensions[name][0], heightMm: paperDimensions[name][1], defaultDpi: 300,
      sourceLabel: sources.iso216.label, sourceUrl: sources.iso216.url, verifiedAt: verifiedAt,
      notice: 'ISO 216 成品纸张尺寸。实际打印区域还取决于打印机不可打印边缘。'
    };
  });

  var sizes = officialSizes.concat(photoSizes, paperSizes);

  function positiveNumber(value, label) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error(label + '必须是大于 0 的有效数值。');
    return number;
  }

  function rounded(value, digits) {
    var factor = Math.pow(10, digits === undefined ? 4 : digits);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function convertPhysicalSize(input) {
    var value = input || {};
    var unitFactors = { mm: 1, cm: 10, in: 25.4 };
    var dpi = positiveNumber(value.dpi, 'DPI');
    if (dpi > 2400) throw new Error('DPI 应在 1–2400 之间。');
    if (!unitFactors[value.unit] && value.unit !== 'px') throw new Error('请选择毫米、厘米、英寸或像素作为尺寸单位。');
    var unitFactor = value.unit === 'px' ? 25.4 / dpi : unitFactors[value.unit];
    var widthMm = positiveNumber(value.width, '宽度') * unitFactor;
    var heightMm = positiveNumber(value.height, '高度') * unitFactor;
    return {
      widthMm: rounded(widthMm), heightMm: rounded(heightMm),
      widthCm: rounded(widthMm / 10), heightCm: rounded(heightMm / 10),
      widthInches: rounded(widthMm / 25.4), heightInches: rounded(heightMm / 25.4),
      widthPixels: Math.round(widthMm / 25.4 * dpi), heightPixels: Math.round(heightMm / 25.4 * dpi), dpi: dpi
    };
  }

  function orientedPaper(paper, orientation) {
    var shortSide = Math.min(paper.widthMm, paper.heightMm);
    var longSide = Math.max(paper.widthMm, paper.heightMm);
    return orientation === 'landscape' ? { widthMm: longSide, heightMm: shortSide } : { widthMm: shortSide, heightMm: longSide };
  }

  function layoutRowGroup(item, usableWidth, gap, itemRotated, rows) {
    var itemWidth = itemRotated ? item.heightMm : item.widthMm;
    var columns = usableWidth > 0 ? Math.floor((usableWidth + gap) / (itemWidth + gap)) : 0;
    return { itemRotated: itemRotated, rows: rows, columns: Math.max(0, columns), count: Math.max(0, columns) * rows };
  }

  function layoutCandidate(item, paper, options, paperOrientation, normalRows, rotatedRows) {
    var margin = options.marginMm;
    var gap = options.gapMm;
    var usableWidth = paper.widthMm - margin * 2;
    var usableHeight = paper.heightMm - margin * 2;
    var rowGroups = [layoutRowGroup(item, usableWidth, gap, false, normalRows), layoutRowGroup(item, usableWidth, gap, true, rotatedRows)]
      .filter(function (group) { return group.rows > 0 && group.columns > 0; });
    var rows = normalRows + rotatedRows;
    var count = rowGroups.reduce(function (total, group) { return total + group.count; }, 0);
    var usedHeight = normalRows * item.heightMm + rotatedRows * item.widthMm + Math.max(0, rows - 1) * gap;
    var widthRemainders = rowGroups.map(function (group) {
      var itemWidth = group.itemRotated ? item.heightMm : item.widthMm;
      return usableWidth - group.columns * itemWidth - Math.max(0, group.columns - 1) * gap;
    });
    return {
      count: count, columns: rowGroups.reduce(function (maximum, group) { return Math.max(maximum, group.columns); }, 0), rows: rows,
      rowGroups: rowGroups, mixedOrientation: normalRows > 0 && rotatedRows > 0, paperOrientation: paperOrientation,
      itemRotated: normalRows === 0 && rotatedRows > 0, printableWidthMm: rounded(Math.max(0, usableWidth)), printableHeightMm: rounded(Math.max(0, usableHeight)),
      remainingWidthMm: rounded(Math.max(0, widthRemainders.length ? Math.min.apply(null, widthRemainders) : usableWidth)),
      remainingHeightMm: rounded(Math.max(0, usableHeight - usedHeight)),
      utilizationPercent: count && usableWidth > 0 && usableHeight > 0 ? rounded(item.widthMm * item.heightMm * count / (usableWidth * usableHeight) * 100, 2) : 0
    };
  }

  function layoutCandidates(item, paper, options, paperOrientation) {
    var usableHeight = Math.max(0, paper.heightMm - options.marginMm * 2);
    var maxNormalRows = Math.floor((usableHeight + options.gapMm) / (item.heightMm + options.gapMm));
    var normalColumns = layoutRowGroup(item, Math.max(0, paper.widthMm - options.marginMm * 2), options.gapMm, false, 1).columns;
    var rotatedColumns = options.allowRotation ? layoutRowGroup(item, Math.max(0, paper.widthMm - options.marginMm * 2), options.gapMm, true, 1).columns : 0;
    var bestRows = { normal: 0, rotated: 0, count: 0 };
    for (var normalRows = 0; normalRows <= maxNormalRows; normalRows += 1) {
      var normalHeight = normalRows * item.heightMm + Math.max(0, normalRows - 1) * options.gapMm;
      var remainingHeight = Math.max(0, usableHeight - normalHeight);
      var rotatedRows = !options.allowRotation ? 0 : normalRows ? Math.floor(remainingHeight / (item.widthMm + options.gapMm)) : Math.floor((remainingHeight + options.gapMm) / (item.widthMm + options.gapMm));
      var count = normalRows * normalColumns + rotatedRows * rotatedColumns;
      if (count > bestRows.count) bestRows = { normal: normalRows, rotated: rotatedRows, count: count };
    }
    return [layoutCandidate(item, paper, options, paperOrientation, bestRows.normal, bestRows.rotated)];
  }

  function estimatePrintLayout(itemInput, paperInput, optionInput) {
    var item = { widthMm: positiveNumber(itemInput.widthMm, '单项宽度'), heightMm: positiveNumber(itemInput.heightMm, '单项高度') };
    var paperValues = { widthMm: positiveNumber(paperInput.widthMm, '纸张宽度'), heightMm: positiveNumber(paperInput.heightMm, '纸张高度') };
    var options = Object.assign({ marginMm: 5, gapMm: 2, allowRotation: true, paperOrientation: 'auto' }, optionInput || {});
    options.marginMm = Number(options.marginMm);
    options.gapMm = Number(options.gapMm);
    if (!Number.isFinite(options.marginMm) || options.marginMm < 0) throw new Error('页边距不能小于 0。');
    if (!Number.isFinite(options.gapMm) || options.gapMm < 0) throw new Error('项目间距不能小于 0。');
    if (['auto', 'portrait', 'landscape'].indexOf(options.paperOrientation) === -1) throw new Error('请选择有效的纸张方向。');
    var paperOrientations = options.paperOrientation === 'auto' ? ['portrait', 'landscape'] : [options.paperOrientation];
    var candidates = [];
    paperOrientations.forEach(function (paperOrientation) {
      var paper = orientedPaper(paperValues, paperOrientation);
      candidates = candidates.concat(layoutCandidates(item, paper, options, paperOrientation));
    });
    candidates.sort(function (first, second) { return second.count - first.count || second.utilizationPercent - first.utilizationPercent; });
    var best = candidates[0];
    best.message = best.count ? '预计可完整排入 ' + best.count + ' 项。' : '当前尺寸和页边距下无法放入一项。';
    return best;
  }

  function normalizedSearchText(value) {
    return String(value || '').toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
  }

  function searchSizes(query, category) {
    var keyword = normalizedSearchText(query);
    return sizes.filter(function (item) {
      if (category && category !== 'all' && item.category !== category) return false;
      if (!keyword) return true;
      return normalizedSearchText([item.name, item.purpose, item.notice].concat(item.aliases || []).join(' ')).indexOf(keyword) !== -1;
    });
  }

  function sizeById(id) { return sizes.find(function (item) { return item.id === id; }) || null; }

  return {
    sizes: sizes,
    sources: sources,
    convertPhysicalSize: convertPhysicalSize,
    estimatePrintLayout: estimatePrintLayout,
    searchSizes: searchSizes,
    sizeById: sizeById
  };
}));
