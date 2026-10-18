'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {workerMotion} = require('../web/motion.js');

const active = Object.freeze({id: 'agent', state: 'working'});
const neutral = {x: 0, y: 0, armLeft: 0, armRight: 0, step: 0, facing: 1, activity: 'resting'};

test('only confirmed working occupants animate, regardless of manager or agent role', () => {
  for (const state of ['idle', 'done', 'paused', 'delegated', 'online', '', undefined]) {
    for (const tick of [1, 200, 4300, 5300, 60100]) {
      assert.deepEqual(workerMotion({state}, tick, 2), neutral, String(state));
    }
  }
  assert.deepEqual(workerMotion(null, 1200), neutral);
  for (const tick of [800, 4200, 5300]) {
    const manager = workerMotion({state: 'working', role: 'manager'}, tick);
    assert.deepEqual(manager, workerMotion({state: 'working', role: 'agent'}, tick));
    assert.notEqual(manager.activity, 'resting');
  }
});

test('reduced motion and the initial frame keep every occupant completely still', () => {
  for (const tick of [0, 1, 1250, 4500, 5800, 100000]) {
    for (const index of [0, 1, 8]) {
      assert.deepEqual(workerMotion(active, tick, index, false), neutral);
    }
  }
  assert.deepEqual(workerMotion(active, 0, 5), neutral);
  for (const tick of [NaN, Infinity, -10, undefined]) {
    assert.deepEqual(workerMotion(active, tick), neutral);
  }
});

test('working occupants type, stretch, and pace visibly while staying inside their desk region', () => {
  const activities = new Set();
  const positions = new Set();
  const steps = new Set();
  let furthestX = 0;
  let furthestY = 0;
  for (let index = 0; index < 12; index++) {
    for (let tick = 1; tick < 12000; tick += 37) {
      const pose = workerMotion(active, tick, index);
      activities.add(pose.activity);
      positions.add(pose.x + ',' + pose.y);
      steps.add(pose.step);
      furthestX = Math.max(furthestX, Math.abs(pose.x));
      furthestY = Math.max(furthestY, Math.abs(pose.y));
      for (const key of ['x', 'y', 'armLeft', 'armRight', 'step', 'facing']) {
        assert.ok(Number.isInteger(pose[key]), key + ' is a finite pixel offset');
      }
      assert.ok(Math.abs(pose.x) <= 8);
      assert.ok(Math.abs(pose.y) <= 3);
      assert.ok(Math.abs(pose.armLeft) <= 5 && Math.abs(pose.armRight) <= 5);
      assert.ok(pose.step === 0 || pose.step === 1);
      assert.ok(pose.facing === -1 || pose.facing === 1);
    }
  }
  assert.deepEqual([...activities].sort(), ['pacing', 'stretching', 'typing']);
  assert.deepEqual([...steps].sort(), [0, 1]);
  assert.equal(furthestX, 8);
  assert.equal(furthestY, 3);
  assert.ok(positions.size > 20, 'motion includes more than a tiny leg flicker');
});

test('typing alternates arms, stretching lifts both arms, and pacing changes stride and direction', () => {
  const firstTap = workerMotion(active, 70);
  const secondTap = workerMotion(active, 210);
  assert.equal(firstTap.activity, 'typing');
  assert.equal(firstTap.armLeft, secondTap.armRight);
  assert.equal(firstTap.armRight, secondTap.armLeft);
  const stretch = workerMotion(active, 4450);
  assert.equal(stretch.activity, 'stretching');
  assert.equal(stretch.armLeft, -5);
  assert.equal(stretch.armRight, -5);
  assert.equal(workerMotion(active, 5000).facing, 1);
  assert.equal(workerMotion(active, 5450).facing, -1);
  assert.notEqual(workerMotion(active, 5000).step, workerMotion(active, 5090).step);
});

test('motion is deterministic, repeats every six seconds, and staggers neighboring workers', () => {
  for (const tick of [137, 2200, 4450, 5500]) {
    const pose = workerMotion(active, tick, 3);
    assert.deepEqual(workerMotion(active, tick, 3), pose);
    assert.deepEqual(workerMotion(active, tick + 6000, 3), pose);
  }
  const simultaneous = Array.from({length: 5}, (_, index) => workerMotion(active, 1800, index));
  assert.equal(new Set(simultaneous.map(pose => JSON.stringify(pose))).size, 5);
  assert.equal(active.state, 'working');
});

test('the same motion function loads as a plain browser script', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/motion.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.workerMotion, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.workerMotion(active, 5300, 2))), workerMotion(active, 5300, 2));
});
