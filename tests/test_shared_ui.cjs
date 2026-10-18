'use strict';

// These are application integration checks, not browser rendering assertions.
// The real layout and app scripts run against a small DOM/canvas substitute so
// polling, accessible desks, selection, and controls can be checked without npm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const webRoot = path.join(__dirname, '../web');

class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toLowerCase();
    this.document = document;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.clientWidth = 800;
    this._text = '';
    this.classList = {
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !names.has(name) : Boolean(force);
        if (enabled) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
        return enabled;
      }
    };
    this.context = {fillRect() {}, imageSmoothingEnabled: true};
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getContext(type) { assert.equal(type, '2d'); return this.context; }
  focus() { this.document.activeElement = this; }
  querySelectorAll(selector) {
    const result = [];
    function visit(element) {
      for (const child of element.children) {
        if (matches(child, selector)) result.push(child);
        visit(child);
      }
    }
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function matches(element, selector) {
  const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
  if (tag && element.tagName !== tag.toLowerCase()) return false;
  for (const [, className] of selector.matchAll(/\.([\w-]+)/g)) {
    if (!element.className.split(/\s+/).includes(className)) return false;
  }
  for (const [, attribute] of selector.matchAll(/\[([\w-]+)\]/g)) {
    if (attribute.startsWith('data-')) {
      const key = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (element.dataset[key] === undefined) return false;
    } else if (element.getAttribute(attribute) === null) return false;
  }
  return true;
}

function makeFarm(id, count) {
  return {
    id, name: 'Team ' + id, title: 'Project ' + id, directory: '/projects/' + id,
    source: 'session', linked: false, observed_at: 100,
    workers: Array.from({length: count}, (_, index) => ({
      id: id + '-worker-' + index,
      name: index ? 'Agent ' + index : 'Manager',
      state: index % 2 ? 'working' : 'idle',
      task: 'Task for ' + id + ' worker ' + index,
      goal: 'Goal for ' + id + ' worker ' + index
    }))
  };
}

async function application(farms) {
  const document = {activeElement: null, hidden: false};
  const body = new Element('body', document);
  const byId = new Map();
  // Use actual markup IDs: a renamed or missing control fails in the real app.
  for (const [, tag, id] of fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')
    .matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"/gi)) {
    const element = new Element(tag, document);
    byId.set(id, element);
    body.append(element);
  }
  document.createElement = tag => new Element(tag, document);
  document.getElementById = id => byId.get(id) || null;
  document.querySelectorAll = selector => body.querySelectorAll(selector);
  document.querySelector = selector => body.querySelector(selector);

  const responses = [{farms, updated_at: 100}];
  const requests = [];
  const intervals = [];
  const frames = [];
  const context = vm.createContext({
    document, URLSearchParams, AbortSignal,
    matchMedia: () => ({matches: false}),
    requestAnimationFrame: callback => frames.push(callback),
    setInterval: (callback, delay) => intervals.push({callback, delay}),
    fetch: async url => {
      requests.push(url);
      if (!responses.length) throw new Error('Unexpected status request');
      const response = responses.shift();
      return {ok: true, json: async () => response};
    }
  });
  vm.runInContext(fs.readFileSync(path.join(webRoot, 'layout.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(webRoot, 'app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.equal(byId.get('connection-dot').className, 'good');
  return {
    document, byId, context, requests, intervals, frames,
    world: byId.get('world-space'),
    async poll(nextFarms) {
      responses.push({farms: nextFarms, updated_at: 101});
      assert.equal(intervals.length, 1);
      assert.equal(intervals[0].delay, 2000);
      await intervals[0].callback();
    }
  };
}

test('one shared scene contains an office and every desk for each team', async () => {
  const app = await application([makeFarm('large', 25), makeFarm('small', 3)]);
  assert.equal(app.world.querySelectorAll('canvas.world-scene').length, 1);
  const offices = app.world.querySelectorAll('.office');
  assert.equal(offices.length, 2);
  assert.equal(offices[0].querySelectorAll('.desk-button').length, 25);
  assert.equal(offices[1].querySelectorAll('.desk-button').length, 3);
  assert.equal(app.world.querySelectorAll('.desk-button.manager').length, 2);
  assert.equal(app.byId.get('agent-count').textContent, '26');
  const last = offices[0].querySelectorAll('.desk-button').at(-1);
  assert.match(last.getAttribute('aria-label'), /Agent 24.*Task for large worker 24/);
  assert.ok(parseFloat(last.style.top) + parseFloat(last.style.height) <= parseFloat(offices[0].style.height));
  // The animation loop draws the same world instead of introducing card canvases.
  app.frames.shift()(1000);
  assert.equal(app.world.querySelectorAll('canvas.world-scene').length, 1);
});

test('selecting a subagent desk shows its task and can return to the whole team', async () => {
  const app = await application([makeFarm('alpha', 4)]);
  app.world.querySelectorAll('.desk-button')[2].onclick();
  const panel = app.byId.get('inspector');
  assert.equal(panel.hidden, false);
  assert.equal(panel.querySelectorAll('.detail-worker').length, 1);
  assert.match(panel.textContent, /AGENT 2/);
  assert.match(panel.textContent, /Task for alpha worker 2/);
  assert.doesNotMatch(panel.textContent, /Task for alpha worker 1/);
  assert.equal(app.world.querySelectorAll('.desk-button.selected').length, 1);
  panel.querySelector('.office-back').onclick();
  assert.equal(panel.querySelectorAll('.detail-worker').length, 4);
  assert.match(panel.textContent, /Task for alpha worker 0/);
  panel.querySelector('.close').onclick();
  assert.equal(panel.hidden, true);
});

test('polling updates the selected task, preserves focus, and creates spawned desks', async () => {
  const app = await application([makeFarm('alpha', 3)]);
  app.world.querySelectorAll('.desk-button')[1].onclick();
  const selected = app.world.querySelectorAll('.desk-button')[1];
  selected.focus();
  const next = makeFarm('alpha', 15);
  next.workers[1].task = 'Reviewing the new parser';
  next.workers[1].state = 'working';
  await app.poll([next]);
  assert.equal(app.world.querySelectorAll('canvas.world-scene').length, 1);
  assert.equal(app.world.querySelectorAll('.office').length, 1);
  assert.equal(app.world.querySelectorAll('.desk-button').length, 15);
  assert.match(app.byId.get('inspector').textContent, /Reviewing the new parser/);
  assert.doesNotMatch(app.byId.get('inspector').textContent, /Task for alpha worker 1/);
  assert.equal(app.document.activeElement.dataset.deskKey, selected.dataset.deskKey);
  assert.notEqual(app.document.activeElement, selected);
  assert.equal(app.document.activeElement.getAttribute('aria-pressed'), 'true');
  assert.match(app.requests[1], /^\/api\/status\?/);
});

test('zoom controls scale the whole shared world and respect their limits', async () => {
  const app = await application([makeFarm('alpha', 4)]);
  for (let i = 0; i < 10; i++) app.byId.get('zoom-in').onclick();
  assert.equal(app.byId.get('zoom-label').textContent, '200%');
  assert.equal(app.byId.get('zoom-in').disabled, true);
  assert.equal(app.world.style.transform, 'scale(2)');
  assert.equal(app.byId.get('world-sizer').style.width, '1520px');
  for (let i = 0; i < 10; i++) app.byId.get('zoom-out').onclick();
  assert.equal(app.byId.get('zoom-label').textContent, '25%');
  assert.equal(app.byId.get('zoom-out').disabled, true);
  app.byId.get('world-viewport').clientWidth = 778;
  app.byId.get('zoom-fit').onclick();
  assert.equal(app.byId.get('zoom-label').textContent, '100%');
  assert.equal(app.world.style.transform, 'scale(1)');
});

test('reordered status responses keep existing offices and agent desks in place', async () => {
  const app = await application([makeFarm('alpha', 4), makeFarm('beta', 2)]);
  const before = app.world.querySelectorAll('.desk-button').map(button => ({
    key: button.dataset.deskKey, left: button.style.left, top: button.style.top
  }));
  const alpha = makeFarm('alpha', 5);
  alpha.workers = [alpha.workers[0], alpha.workers[3], alpha.workers[4], alpha.workers[1], alpha.workers[2]];
  await app.poll([makeFarm('beta', 2), alpha]);
  const offices = app.world.querySelectorAll('.office');
  assert.match(offices[0].getAttribute('aria-label'), /^Team alpha office/);
  assert.match(offices[1].getAttribute('aria-label'), /^Team beta office/);
  const after = new Map(app.world.querySelectorAll('.desk-button').map(button => [
    button.dataset.deskKey, {left: button.style.left, top: button.style.top}
  ]));
  for (const desk of before) assert.deepEqual(after.get(desk.key), {left: desk.left, top: desk.top});
  assert.equal(offices[0].querySelectorAll('.desk-button').at(-1).dataset.deskKey,
    JSON.stringify(['alpha', 'alpha-worker-4']));
});

test('empty live activity has no offices or desks and explains how to populate the world', async () => {
  const app = await application([]);
  assert.equal(app.world.querySelectorAll('canvas.world-scene').length, 1);
  assert.equal(app.world.querySelectorAll('.office').length, 0);
  assert.equal(app.world.querySelectorAll('.desk-button').length, 0);
  assert.equal(app.byId.get('farms').hidden, true);
  assert.equal(app.byId.get('empty').hidden, false);
  assert.match(app.byId.get('empty-text').textContent, /Start Codex/);
  assert.equal(app.byId.get('inspector').hidden, true);
});
