import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineLayout, DAY_WIDTH, barTop, clamp, ROW_HEIGHT_RANGE } from '../src/layout.js';

test('every zoom mode fills the screen even for a short project', () => {
  for (const mode of ['day', 'week', 'month']) {
    const layout = timelineLayout({ mode, projectDays: 35, viewportWidth: 1920 });
    assert.ok(layout.width + layout.tableWidth >= 1920, `${mode} leaves blank space`);
    assert.equal(layout.dayWidth, DAY_WIDTH[mode], 'zoom keeps its readable scale');
    assert.ok(layout.totalDays >= 35, 'project dates remain visible');
    assert.equal(layout.width, layout.totalDays * layout.dayWidth, 'grid and bars share the same scale');
  }
});

test('long projects overflow horizontally without squeezing date columns', () => {
  for (const mode of ['day', 'week', 'month']) {
    const layout = timelineLayout({ mode, projectDays: 730, viewportWidth: 1280 });
    assert.ok(layout.width + layout.tableWidth > 1280);
    assert.equal(layout.dayWidth, DAY_WIDTH[mode]);
    assert.equal(layout.totalDays, 730);
  }
});

test('resizing adds calendar columns without changing task scale', () => {
  const narrow = timelineLayout({ mode: 'month', projectDays: 35, viewportWidth: 900 });
  const wide = timelineLayout({ mode: 'month', projectDays: 35, viewportWidth: 2560 });
  assert.equal(narrow.dayWidth, wide.dayWidth);
  assert.ok(wide.totalDays > narrow.totalDays);
  assert.ok(wide.width + wide.tableWidth >= 2560);
});

test('fit mode is explicit and fills available timeline space', () => {
  const layout = timelineLayout({ mode: 'fit', projectDays: 365, viewportWidth: 1360 });
  assert.ok(Math.abs(layout.width + layout.tableWidth - 1360) < 1);
  assert.equal(layout.totalDays, 365);
});

test('a wider task panel leaves less room for the timeline', () => {
  const narrow = timelineLayout({ mode: 'fit', projectDays: 100, viewportWidth: 1360, tableWidth: 250 });
  const wide = timelineLayout({ mode: 'fit', projectDays: 100, viewportWidth: 1360, tableWidth: 600 });
  assert.equal(narrow.tableWidth, 250);assert.ok(narrow.width > wide.width);assert.ok(Math.abs(wide.width + 600 - 1360) < 1);
});

test('task bars stay vertically centred for every row height', () => {
  assert.equal(barTop(0), 13);
  for (const h of [32, 48, 64, 96]) { const top = barTop(3, h); assert.ok(Math.abs(top + 12 - (3 * h + h / 2)) <= 1); }
  assert.equal(clamp(10, ROW_HEIGHT_RANGE), ROW_HEIGHT_RANGE.min);
});
