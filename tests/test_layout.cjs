'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {layoutOffices} = require('../web/layout.js');

function farm(id, workerCount) {
  return {
    id,
    name: 'Office ' + id,
    workers: Array.from({length: workerCount}, (_, index) => ({
      id: id + '-worker-' + index,
      name: index ? 'Agent ' + index : 'Manager'
    }))
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function checkBounds(layout) {
  for (const office of layout.offices) {
    assert.ok(office.x >= 0 && office.y >= 0);
    assert.ok(office.x + office.width <= layout.width);
    assert.ok(office.y + office.height <= layout.height);
    for (const desk of office.desks) {
      assert.ok(desk.x >= office.x && desk.y >= office.y);
      assert.ok(desk.x + desk.width <= office.x + office.width);
      assert.ok(desk.y + desk.height <= office.y + office.height - 32);
    }
    for (let i = 0; i < office.desks.length; i++) {
      for (let j = i + 1; j < office.desks.length; j++) {
        assert.equal(overlaps(office.desks[i], office.desks[j]), false,
          'desks for ' + office.desks[i].workerId + ' and ' + office.desks[j].workerId);
      }
    }
  }
  for (let i = 0; i < layout.offices.length; i++) {
    for (let j = i + 1; j < layout.offices.length; j++) {
      assert.equal(overlaps(layout.offices[i], layout.offices[j]), false,
        'offices ' + layout.offices[i].farmId + ' and ' + layout.offices[j].farmId);
    }
  }
}

test('an empty world has deterministic usable bounds', () => {
  assert.deepEqual(layoutOffices([]), {width: 760, height: 264, offices: []});
});

test('offices with zero workers still reserve room and do not invent a manager', () => {
  const layout = layoutOffices([farm('empty', 0), {id: 'missing'}]);
  assert.equal(layout.offices.length, 2);
  assert.deepEqual(layout.offices.map(office => office.desks), [[], []]);
  checkBounds(layout);
});

test('a manager is centered below the office heading', () => {
  const layout = layoutOffices([farm('solo', 1)]);
  const office = layout.offices[0];
  const manager = office.desks[0];
  assert.equal(manager.manager, true);
  assert.equal(manager.workerId, 'solo-worker-0');
  assert.equal(manager.x + manager.width / 2, office.x + office.width / 2);
  assert.ok(manager.y >= office.y + 32);
  checkBounds(layout);
});

test('subagents receive individual desks in rows of three below the manager', () => {
  const layout = layoutOffices([farm('team', 8)]);
  const desks = layout.offices[0].desks;
  assert.equal(desks.length, 8);
  assert.deepEqual(desks.map(desk => desk.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(desks.filter(desk => desk.manager).length, 1);
  assert.equal(desks[1].y, desks[3].y);
  assert.ok(desks[1].x < desks[2].x && desks[2].x < desks[3].x);
  assert.equal(desks[4].x, desks[1].x);
  assert.ok(desks[4].y > desks[3].y);
  assert.ok(desks[1].y >= desks[0].y + desks[0].height);
  checkBounds(layout);
});

test('uneven teams share two columns while the next row clears both offices', () => {
  const layout = layoutOffices([farm('big', 40), farm('small', 1), farm('third', 7)]);
  const [big, small, third] = layout.offices;
  assert.equal(big.x, 40);
  assert.equal(small.x, 400);
  assert.equal(small.y, big.y);
  assert.equal(third.x, big.x);
  assert.ok(third.y >= Math.max(big.y + big.height, small.y + small.height) + 40);
  checkBounds(layout);
});

test('large teams never truncate members or overlap rooms and desks', () => {
  const farms = [farm('first', 131), farm('second', 100), farm('third', 250), farm('fourth', 0), farm('last', 4)];
  const layout = layoutOffices(farms);
  assert.deepEqual(layout.offices.map(office => office.desks.length), [131, 100, 250, 0, 4]);
  assert.deepEqual(layout.offices.flatMap(office => office.desks.map(desk => desk.workerId)),
    farms.flatMap(item => item.workers.map(worker => worker.id)));
  checkBounds(layout);
});

test('adding and removing trailing workers preserves every remaining desk position', () => {
  const originalFarm = farm('growing', 6);
  const original = layoutOffices([originalFarm]).offices[0];
  const expanded = layoutOffices([farm('growing', 14)]).offices[0];
  const reduced = layoutOffices([farm('growing', 3)]).offices[0];
  assert.deepEqual(expanded.desks.slice(0, 6), original.desks);
  assert.deepEqual(reduced.desks, original.desks.slice(0, 3));
  assert.ok(expanded.height > original.height);
  checkBounds(layoutOffices([farm('growing', 14)]));
});

test('names and activity changes keep the same IDs and geometry without changing input', () => {
  const input = [farm('stable', 5)];
  const snapshot = JSON.stringify(input);
  for (const worker of input[0].workers) Object.freeze(worker);
  Object.freeze(input[0].workers);
  Object.freeze(input[0]);
  Object.freeze(input);
  const before = layoutOffices(input);
  assert.equal(JSON.stringify(input), snapshot);
  const renamed = JSON.parse(snapshot);
  renamed[0].name = 'A different room title';
  renamed[0].workers.forEach(worker => {worker.name = 'New name'; worker.task = 'Writing tests';});
  assert.deepEqual(layoutOffices(renamed), before);
  assert.deepEqual(layoutOffices(input), before);
});

test('the same layout function works as a plain browser script', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/layout.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.layoutOffices, 'function');
  assert.equal(sandbox.layoutOffices([farm('browser', 2)]).offices[0].desks.length, 2);
});
