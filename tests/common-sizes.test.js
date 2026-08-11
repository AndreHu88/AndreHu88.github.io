const test = require('node:test');
const assert = require('node:assert/strict');
const commonSizes = require('../assets/js/common-sizes-data.js');

test('size catalog keeps official references separate from common names', () => {
  const ids = commonSizes.sizes.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  commonSizes.sizes.forEach((item) => {
    assert.match(item.sourceUrl, /^https:\/\//, `${item.id} should keep a verifiable source address`);
    assert.match(item.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  });

  const residentId = commonSizes.sizes.find((item) => item.id === 'cn-resident-id-photo');
  assert.deepEqual(
    {
      sourceType: residentId.sourceType,
      widthMm: residentId.widthMm,
      heightMm: residentId.heightMm,
      fixedPixels: residentId.fixedPixels,
      defaultDpi: residentId.defaultDpi
    },
    {
      sourceType: 'official',
      widthMm: 26,
      heightMm: 32,
      fixedPixels: { width: 358, height: 441 },
      defaultDpi: 350
    }
  );
  assert.match(residentId.sourceUrl, /^https:\/\//);

  const oneInch = commonSizes.sizes.find((item) => item.id === 'common-one-inch');
  assert.equal(oneInch.sourceType, 'common');
  assert.match(oneInch.notice, /常见参考/);

  ['A0', 'A10', 'B0', 'B10'].forEach((name) => {
    const paper = commonSizes.sizes.find((item) => item.name === name);
    assert.ok(paper, `${name} paper is missing`);
    assert.equal(paper.sourceType, 'standard');
  });
});

test('physical size conversion uses known DPI results and supports reverse units', () => {
  const idPixels = commonSizes.convertPhysicalSize({ width: 26, height: 32, unit: 'mm', dpi: 350 });
  assert.deepEqual(
    { widthPixels: idPixels.widthPixels, heightPixels: idPixels.heightPixels },
    { widthPixels: 358, heightPixels: 441 }
  );

  const fourBySix = commonSizes.convertPhysicalSize({ width: 4, height: 6, unit: 'in', dpi: 300 });
  assert.deepEqual(
    {
      widthMm: fourBySix.widthMm,
      heightMm: fourBySix.heightMm,
      widthPixels: fourBySix.widthPixels,
      heightPixels: fourBySix.heightPixels
    },
    { widthMm: 101.6, heightMm: 152.4, widthPixels: 1200, heightPixels: 1800 }
  );

  const pixelsToPrint = commonSizes.convertPhysicalSize({ width: 1200, height: 1800, unit: 'px', dpi: 300 });
  assert.deepEqual(
    {
      widthMm: pixelsToPrint.widthMm,
      heightMm: pixelsToPrint.heightMm,
      widthInches: pixelsToPrint.widthInches,
      heightInches: pixelsToPrint.heightInches,
      widthPixels: pixelsToPrint.widthPixels,
      heightPixels: pixelsToPrint.heightPixels
    },
    { widthMm: 101.6, heightMm: 152.4, widthInches: 4, heightInches: 6, widthPixels: 1200, heightPixels: 1800 }
  );

  assert.throws(
    () => commonSizes.convertPhysicalSize({ width: 35, height: 45, unit: 'mm', dpi: 0 }),
    /DPI/
  );
});

test('print layout compares orientations and never counts partial items', () => {
  const layout = commonSizes.estimatePrintLayout(
    { widthMm: 35, heightMm: 45 },
    { widthMm: 210, heightMm: 297 },
    { marginMm: 5, gapMm: 2, allowRotation: true, paperOrientation: 'auto' }
  );
  assert.equal(layout.count, 31);
  assert.equal(layout.mixedOrientation, true);
  assert.deepEqual(layout.rowGroups, [
    { itemRotated: false, rows: 3, columns: 5, count: 15 },
    { itemRotated: true, rows: 4, columns: 4, count: 16 }
  ]);
  assert.ok(layout.utilizationPercent > 50 && layout.utilizationPercent < 100);
  assert.ok(layout.remainingWidthMm >= 0);
  assert.ok(layout.remainingHeightMm >= 0);

  const cannotFit = commonSizes.estimatePrintLayout(
    { widthMm: 210, heightMm: 297 },
    { widthMm: 210, heightMm: 297 },
    { marginMm: 5, gapMm: 0, allowRotation: true, paperOrientation: 'portrait' }
  );
  assert.equal(cannotFit.count, 0);
  assert.match(cannotFit.message, /无法放入/);
});

test('search finds aliases and purpose while category filtering stays exact', () => {
  assert.equal(commonSizes.searchSizes('身份证', 'official')[0].id, 'cn-resident-id-photo');
  assert.ok(commonSizes.searchSizes('冲印', 'photo').length >= 4);
  assert.deepEqual(commonSizes.searchSizes('A4', 'paper').map((item) => item.name), ['A4']);
  assert.equal(commonSizes.searchSizes('', 'official').every((item) => item.category === 'official'), true);
});
