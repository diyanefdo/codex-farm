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
  for (const area of layout.commonAreas || []) {
    assert.ok(area.x >= 0 && area.y >= 0);
    assert.ok(area.x + area.width <= layout.width + 1e-10);
    assert.ok(area.y + area.height <= layout.height);
    for (const office of layout.offices) {
      assert.equal(overlaps(area, office), false, area.name + ' overlaps ' + office.farmId);
    }
  }
  for (let i = 0; i < (layout.commonAreas || []).length; i++) {
    for (let j = i + 1; j < layout.commonAreas.length; j++) {
      assert.equal(overlaps(layout.commonAreas[i], layout.commonAreas[j]), false);
    }
  }
}

test('an empty world has deterministic usable bounds', () => {
  assert.deepEqual(layoutOffices([]), {width: 760, height: 260, offices: []});
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

test('subagents share a compact first row with the manager and receive individual desks', () => {
  const layout = layoutOffices([farm('team', 8)]);
  const desks = layout.offices[0].desks;
  assert.equal(desks.length, 8);
  assert.deepEqual(desks.map(desk => desk.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(desks.filter(desk => desk.manager).length, 1);
  assert.equal(desks[1].y, desks[0].y);
  assert.equal(desks[2].y, desks[0].y);
  assert.ok(desks[1].x < desks[0].x && desks[0].x < desks[2].x);
  assert.equal(desks[3].x, desks[1].x);
  assert.equal(desks[4].x, desks[0].x);
  assert.equal(desks[5].x, desks[2].x);
  assert.ok(desks[3].y >= desks[0].y + desks[0].height);
  checkBounds(layout);
});

test('every desk reserves room for a name and three task preview lines', () => {
  const layout = layoutOffices([farm('previews', 8)]);
  const office = layout.offices[0];
  const desks = office.desks;
  assert.equal(desks[0].y, office.y + 44);
  assert.equal(desks[1].y, office.y + 44);
  assert.equal(desks[4].y - desks[1].y, 116);
  for (const desk of desks) {
    assert.equal(desk.width, 80);
    assert.equal(desk.height, 104);
    assert.ok(desk.y + 52 + 12 + 3 * 10 <= desk.y + desk.height,
      'the name and three preview lines fit within ' + desk.workerId);
  }
  assert.equal(office.y + office.height - (desks[7].y + desks[7].height), 32);
  checkBounds(layout);
});

test('compact offices use a single row for up to three workers', () => {
  for (let count = 0; count <= 3; count++) {
    const layout = layoutOffices([farm('compact', count)]);
    assert.equal(layout.offices[0].height, 180);
    checkBounds(layout);
  }
});

test('viewport dimensions choose readable grids for four, six and twelve offices', () => {
  for (const [count, expectedColumns] of [[4, 2], [6, 3], [12, 4]]) {
    const farms = Array.from({length: count}, (_, index) => farm('team-' + index, 6));
    const layout = layoutOffices(farms, {viewportWidth: 1600, viewportHeight: 900});
    assert.equal(new Set(layout.offices.map(office => office.x)).size, expectedColumns);
    assert.equal(layout.width, 80 + expectedColumns * 320 + (expectedColumns - 1) * 40);
    assert.deepEqual(layout.offices.flatMap(office => office.desks.map(desk => desk.workerId)),
      farms.flatMap(item => item.workers.map(worker => worker.id)));
    const scale = Math.min(1600 / layout.width, 900 / layout.height);
    for (const office of layout.offices) {
      assert.ok((office.x + office.width) * scale <= 1600);
      assert.ok((office.y + office.height) * scale <= 900);
    }
    checkBounds(layout);
  }
});

test('adaptive grids retain every uneven team and favor fewer columns on a tie', () => {
  const farms = [farm('large', 25), farm('one', 1), farm('medium', 7), farm('two', 2)];
  const layout = layoutOffices(farms, {viewportWidth: 1920, viewportHeight: 1080});
  assert.deepEqual(layout.offices.map(office => office.desks.length), [25, 1, 7, 2]);
  checkBounds(layout);
  const solo = layoutOffices([farm('solo', 1)], {viewportWidth: 1000, viewportHeight: 800});
  assert.equal(solo.width, 400);
  const tied = layoutOffices(Array.from({length: 6}, (_, index) => farm('solo-' + index, 1)),
    {viewportWidth: 1440, viewportHeight: 900});
  assert.equal(new Set(tied.offices.map(office => office.x)).size, 2);
});

test('absent or unusable viewport dimensions preserve the default two columns', () => {
  const farms = [farm('first', 4), farm('second', 2), farm('third', 1)];
  const expected = layoutOffices(farms);
  for (const options of [{}, {viewportWidth: 900}, {viewportWidth: 0, viewportHeight: 800},
    {viewportWidth: 900, viewportHeight: Infinity}, {viewportWidth: NaN, viewportHeight: 800}]) {
    assert.deepEqual(layoutOffices(farms, options), expected);
  }
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

test('shared break, lunch and coffee areas fit in worlds with zero, one, four and twelve offices', () => {
  for (const count of [0, 1, 4, 12]) {
    const farms = Array.from({length: count}, (_, index) => farm('team-' + index, index % 8));
    for (const options of [{}, {viewportWidth: 1600, viewportHeight: 900},
      {viewportWidth: 390, viewportHeight: 844}]) {
      const layout = layoutOffices(farms, {...options, includeCommons: true});
      assert.deepEqual(layout.commonAreas.map(area => [area.id, area.name, area.type]), [
        ['break', 'Break area', 'break'],
        ['lunch', 'Lunch area', 'lunch'],
        ['coffee', 'Coffee machine', 'coffee']
      ]);
      assert.deepEqual(layout.offices.flatMap(office => office.desks.map(desk => desk.workerId)),
        farms.flatMap(item => item.workers.map(worker => worker.id)));
      const officeBottom = Math.max(0, ...layout.offices.map(office => office.y + office.height));
      for (const area of layout.commonAreas) {
        assert.equal(area.height, 132);
        assert.ok(area.width >= 180);
        assert.ok(area.y >= officeBottom + 40);
        assert.ok(area.x >= 40);
        assert.ok(area.x + area.width <= layout.width - 40 + 1e-10);
        assert.ok(area.y + area.height <= layout.height - 40);
      }
      checkBounds(layout);
    }
  }
});

test('commons use three columns in a wide world and stack below a single narrow office', () => {
  const wide = layoutOffices([farm('first', 1), farm('second', 1)], {includeCommons: true});
  assert.equal(new Set(wide.commonAreas.map(area => area.y)).size, 1);
  for (let index = 1; index < wide.commonAreas.length; index++) {
    const previous = wide.commonAreas[index - 1];
    assert.ok(Math.abs(wide.commonAreas[index].x - (previous.x + previous.width + 16)) < 1e-10);
  }
  const narrow = layoutOffices([farm('solo', 1)], {
    viewportWidth: 400, viewportHeight: 900, includeCommons: true
  });
  assert.equal(narrow.width, 400);
  assert.equal(new Set(narrow.commonAreas.map(area => area.x)).size, 1);
  assert.equal(new Set(narrow.commonAreas.map(area => area.y)).size, 3);
  assert.equal(narrow.commonAreas[1].y - narrow.commonAreas[0].y, 148);
  checkBounds(wide);
  checkBounds(narrow);
});

test('adaptive fit accounts for all common areas when choosing the most readable office grid', () => {
  const farms = Array.from({length: 4}, (_, index) => farm('team-' + index, 6));
  const options = {viewportWidth: 1600, viewportHeight: 900, includeCommons: true};
  const layout = layoutOffices(farms, options);
  assert.equal(new Set(layout.offices.map(office => office.x)).size, 4);
  const scale = Math.min(options.viewportWidth / layout.width, options.viewportHeight / layout.height);
  for (const item of [...layout.offices, ...layout.commonAreas]) {
    assert.ok((item.x + item.width) * scale <= options.viewportWidth + 1e-10);
    assert.ok((item.y + item.height) * scale <= options.viewportHeight + 1e-10);
  }
  checkBounds(layout);
});

test('a single office can share a wider desktop world with three commons side by side', () => {
  const farms = [farm('solo', 1)];
  const options = {viewportWidth: 1600, viewportHeight: 900, includeCommons: true};
  const layout = layoutOffices(farms, options);
  assert.equal(layout.width, 760);
  assert.equal(layout.offices.length, 1);
  assert.equal(new Set(layout.commonAreas.map(area => area.y)).size, 1);
  const wideScale = Math.min(options.viewportWidth / layout.width, options.viewportHeight / layout.height);
  const narrow = layoutOffices(farms, {...options, viewportWidth: 400, viewportHeight: 900});
  assert.equal(narrow.width, 400);
  const narrowScale = Math.min(options.viewportWidth / narrow.width, options.viewportHeight / narrow.height);
  assert.ok(wideScale > narrowScale);
  checkBounds(layout);
});

test('common areas have stable positions independent of names and tasks without mutating input', () => {
  const farms = [farm('first', 6), farm('second', 2)];
  const snapshot = JSON.stringify(farms);
  const options = Object.freeze({includeCommons: true, viewportWidth: 1600, viewportHeight: 900});
  for (const item of farms) {
    item.workers.forEach(Object.freeze);
    Object.freeze(item.workers);
    Object.freeze(item);
  }
  Object.freeze(farms);
  const before = layoutOffices(farms, options);
  assert.equal(JSON.stringify(farms), snapshot);
  const updated = JSON.parse(snapshot);
  updated.forEach(item => {
    item.name = 'Renamed';
    item.workers.forEach(worker => {worker.task = 'New task'; worker.status = 'working';});
  });
  assert.deepEqual(layoutOffices(updated, options), before);
  assert.deepEqual(layoutOffices(farms, options), before);
  assert.equal(Object.hasOwn(layoutOffices(farms), 'commonAreas'), false);
  assert.deepEqual(layoutOffices(farms, {includeCommons: false}), layoutOffices(farms));
});

test('the same layout function works as a plain browser script', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/layout.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.layoutOffices, 'function');
  assert.equal(sandbox.layoutOffices([farm('browser', 2)]).offices[0].desks.length, 2);
});
