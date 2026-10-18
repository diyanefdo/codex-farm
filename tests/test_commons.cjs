'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {drawCommonAreas} = require('../web/commons.js');

function room(type, width = 180, height = 132) {
  return {id: 'commons-' + type, type, name: type, x: 73, y: 111, width, height};
}

function draw(areas, options = {}) {
  const rectangles = [], people = [];
  const ctx = {};
  drawCommonAreas(ctx, areas, {
    rect: (receivedContext, x, y, width, height, color) => {
      assert.equal(receivedContext, ctx);
      rectangles.push({x, y, width, height, color});
    },
    person: (receivedContext, x, y, color, frame, manager, pose) => {
      assert.equal(receivedContext, ctx);
      people.push({x, y, color, frame, manager, pose});
    },
    ...options
  });
  return {rectangles, people};
}

test('all three common rooms keep their furniture and neighbours inside the reserved layout', () => {
  for (const type of ['break', 'lunch', 'coffee']) {
    for (const [width, height] of [[180, 132], [240, 180], [321, 157]]) {
      const area = room(type, width, height);
      const {rectangles, people} = draw([area], {tick: 1200});
      assert.ok(rectangles.length > 30, type + ' has furnished pixel art');
      for (const rect of rectangles) {
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(rect.x >= area.x && rect.y >= area.y + 32, type + ': heading is reserved');
        assert.ok(rect.x + rect.width <= area.x + width);
        assert.ok(rect.y + rect.height <= area.y + height);
      }
      for (const guest of people) {
        // Bounds of the shared person sprite, including hat, arms and shadow.
        assert.ok(guest.x - 5 >= area.x);
        assert.ok(guest.x + 12 <= area.x + width);
        assert.ok(guest.y - 13 >= area.y + 32);
        assert.ok(guest.y + 16 <= area.y + height);
      }
    }
  }
});

test('the lounge, lunch tables and coffee table have seated decorative neighbours', () => {
  const expected = {break: 2, lunch: 3, coffee: 2};
  for (const [type, count] of Object.entries(expected)) {
    const result = draw([room(type)]);
    assert.equal(result.people.length, count, type);
    for (const guest of result.people) {
      assert.equal(guest.manager, false);
      assert.equal(guest.frame, 0);
      assert.equal(guest.pose.activity, 'sitting');
      assert.equal(guest.pose.step, 0);
      assert.ok(result.rectangles.some(rect => rect.x <= guest.x - 1 &&
        rect.x + rect.width >= guest.x + 7 && rect.y <= guest.y + 13 &&
        rect.y + rect.height >= guest.y + 16), type + ': a seat or table hides the standing legs');
    }
  }
});

test('coffee steam animates without moving the seated occupants, and respects motion off', () => {
  const area = room('coffee');
  const first = draw([area], {tick: 1});
  const later = draw([area], {tick: 400});
  assert.notDeepEqual(first.rectangles, later.rectangles);
  assert.deepEqual(first.people, later.people);
  assert.deepEqual(draw([area], {motion: false, tick: 1}), draw([area], {motion: false, tick: 900}));
});

test('common room drawing never modifies area identities or adds people to tracked worker data', () => {
  const areas = ['break', 'lunch', 'coffee'].map(type => Object.freeze(room(type)));
  const workers = Object.freeze([{id: 'real-agent', state: 'working'}]);
  const before = JSON.stringify(areas);
  Object.freeze(areas);
  assert.equal(draw(areas).people.length, 7);
  assert.equal(JSON.stringify(areas), before);
  assert.equal(workers.length, 1);
  assert.deepEqual(areas.map(area => area.id), ['commons-break', 'commons-lunch', 'commons-coffee']);
});

test('the furniture renderer loads directly as a browser script and ignores unknown areas', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/commons.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.drawCommonAreas, 'function');
  assert.deepEqual(draw([room('unknown')]), {rectangles: [], people: []});
});
