import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GOAL,
  buildWavePath,
  computeTideState,
  createTide,
  formatTideLabel,
} from '../src/tide.mjs';

// --- A minimal fake DOM -----------------------------------------------------
// Just enough of the Element surface for createTide. Node has no DOM and the
// project allows no dependencies, so the component is exercised against this
// stub rather than mocked away.

class FakeNode {
  constructor(tagName, namespaceURI, ownerDocument) {
    this.tagName = tagName;
    this.namespaceURI = namespaceURI;
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this._text = '';

    const custom = new Map();
    this.style = {
      setProperty: (name, value) => custom.set(name, String(value)),
      getPropertyValue: (name) => custom.get(name) ?? '',
      removeProperty: (name) => custom.delete(name),
    };

    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      get length() {
        return classes.size;
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    assert.notEqual(index, -1, 'removeChild called with a node that is not a child');
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  set textContent(value) {
    this._text = String(value);
    this.childNodes = [];
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._text;
    return this._text + this.childNodes.map((child) => child.textContent).join('');
  }
}

function createFakeDocument() {
  const doc = {
    createElement(tagName) {
      return new FakeNode(tagName, 'http://www.w3.org/1999/xhtml', doc);
    },
    createElementNS(namespaceURI, tagName) {
      return new FakeNode(tagName, namespaceURI, doc);
    },
    createTextNode(data) {
      const node = new FakeNode('#text', null, doc);
      node.textContent = data;
      return node;
    },
  };
  return doc;
}

/** Depth-first search for the first node matching `predicate`. */
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}

function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.childNodes) findAll(child, predicate, found);
  return found;
}

const byClass = (name) => (node) => node.classList.contains(name) || node.getAttribute('class') === name;
const bySvgClass = (name) => (node) => (node.getAttribute('class') || '').split(/\s+/).includes(name);

function mount(options = {}) {
  const doc = createFakeDocument();
  const container = doc.createElement('div');
  const tide = createTide(container, { document: doc, ...options });
  return { doc, container, tide, root: tide.element };
}

const levelOf = (root) => find(root, bySvgClass('tide__water')).style.transform;

// --- computeTideState -------------------------------------------------------

test('computeTideState defaults to an empty tide against the 120 minute goal', () => {
  assert.equal(DEFAULT_GOAL, 120);
  assert.deepEqual(computeTideState(), {
    minutes: 0,
    goal: 120,
    ratio: 0,
    percent: 0,
    atGoal: false,
  });
  assert.deepEqual(computeTideState({}), computeTideState());
});

test('computeTideState reports partial progress', () => {
  const state = computeTideState({ minutes: 30, goal: 120 });
  assert.equal(state.ratio, 0.25);
  assert.equal(state.percent, 25);
  assert.equal(state.atGoal, false);
});

test('computeTideState treats exactly the goal as reached and full', () => {
  const state = computeTideState({ minutes: 120, goal: 120 });
  assert.equal(state.ratio, 1);
  assert.equal(state.percent, 100);
  assert.equal(state.atGoal, true);
});

test('computeTideState clamps the level above the goal but keeps the total truthful', () => {
  const state = computeTideState({ minutes: 310, goal: 120 });
  assert.equal(state.ratio, 1, 'water level caps at full');
  assert.equal(state.percent, 100);
  assert.equal(state.minutes, 310, 'the real total is preserved');
  assert.equal(state.atGoal, true);
});

test('computeTideState honours a custom goal', () => {
  const state = computeTideState({ minutes: 45, goal: 90 });
  assert.equal(state.ratio, 0.5);
  assert.equal(state.goal, 90);
  assert.equal(state.atGoal, false);
});

test('computeTideState falls back for unusable minutes', () => {
  for (const minutes of [-5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, 'abc', {}]) {
    assert.equal(computeTideState({ minutes }).minutes, 0, `minutes=${String(minutes)}`);
  }
});

test('computeTideState falls back for unusable goals', () => {
  for (const goal of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, 'abc']) {
    assert.equal(computeTideState({ goal }).goal, DEFAULT_GOAL, `goal=${String(goal)}`);
  }
});

test('computeTideState accepts numeric strings and fractional minutes', () => {
  assert.equal(computeTideState({ minutes: '60', goal: '120' }).ratio, 0.5);
  assert.equal(computeTideState({ minutes: 0.5, goal: 120 }).percent, 0);
});

test('computeTideState ignores a non-object input', () => {
  assert.equal(computeTideState(null).goal, DEFAULT_GOAL);
  assert.equal(computeTideState(42).minutes, 0);
});

// --- formatTideLabel --------------------------------------------------------

test('formatTideLabel describes progress below the goal', () => {
  const label = formatTideLabel(computeTideState({ minutes: 30, goal: 120 }));
  assert.equal(label, '30 of 120 focus minutes today. 25% of the daily goal.');
});

test('formatTideLabel announces a reached goal', () => {
  const label = formatTideLabel(computeTideState({ minutes: 150, goal: 120 }));
  assert.equal(label, '150 of 120 focus minutes today. Daily goal reached.');
});

test('formatTideLabel rounds fractional minutes to one decimal', () => {
  const label = formatTideLabel(computeTideState({ minutes: 12.345, goal: 120 }));
  assert.match(label, /^12\.3 of 120 /);
});

// --- buildWavePath ----------------------------------------------------------

test('buildWavePath returns a closed path across the full span', () => {
  const path = buildWavePath({ baseline: 6, amplitude: 2.5, period: 50, span: 200, depth: 260 });
  assert.match(path, /^M 0 6 /);
  assert.ok(path.endsWith('L 200 260 L 0 260 Z'), path);
  assert.equal(path.match(/ Q /g).length, 8, 'two periods per 100 units over a 200 unit span');
});

test('buildWavePath alternates crest and trough', () => {
  const crestFirst = buildWavePath({ baseline: 10, amplitude: 2, period: 50, span: 50, depth: 100 });
  const troughFirst = buildWavePath({
    baseline: 10,
    amplitude: 2,
    period: 50,
    span: 50,
    depth: 100,
    crestFirst: false,
  });
  // A crest's control point sits above the baseline (smaller y), a trough below.
  assert.match(crestFirst, /Q 12\.5 6 25 10/);
  assert.match(troughFirst, /Q 12\.5 14 25 10/);
});

test('buildWavePath has usable defaults', () => {
  assert.match(buildWavePath(), /^M 0 6 Q /);
});

// --- createTide: mounting ---------------------------------------------------

test('createTide rejects a missing container', () => {
  assert.throws(() => createTide(null), TypeError);
  assert.throws(() => createTide({}), TypeError);
});

test('createTide throws a clear error when no document is reachable', () => {
  const orphan = { appendChild() {} };
  assert.throws(() => createTide(orphan, { document: null }), /no document available/);
});

test('createTide appends its own root without clearing the container', () => {
  const doc = createFakeDocument();
  const container = doc.createElement('div');
  const sibling = doc.createElement('p');
  container.appendChild(sibling);

  const tide = createTide(container, { document: doc });

  assert.equal(container.childNodes.length, 2);
  assert.equal(container.childNodes[0], sibling, 'existing shell content is left alone');
  assert.equal(container.childNodes[1], tide.element);
  assert.ok(tide.element.classList.contains('tide'));
});

test('createTide renders inline SVG with no external asset references', () => {
  const { root } = mount();
  const svg = find(root, bySvgClass('tide__svg'));

  assert.ok(svg, 'an svg element is rendered');
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 100 100');
  assert.equal(svg.getAttribute('preserveAspectRatio'), 'none');
  assert.equal(svg.getAttribute('focusable'), 'false');

  const waves = findAll(root, bySvgClass('tide__wave'));
  assert.equal(waves.length, 2, 'two layered waves');
  for (const wave of waves) {
    assert.match(wave.getAttribute('d'), /^M 0 /);
  }

  // No <image>, <use href>, or url(http...) anywhere in the tree.
  const external = find(
    root,
    (node) =>
      node.tagName === 'image' ||
      node.getAttribute('href') !== null ||
      /url\((?!#)/.test(node.getAttribute('fill') || ''),
  );
  assert.equal(external, null, 'nothing is loaded from outside the document');
});

const idOf = (root) => find(root, (node) => node.tagName === 'linearGradient').getAttribute('id');

test('createTide gives each instance its own gradient id', () => {
  const first = mount();
  const second = mount();

  assert.notEqual(idOf(first.root), idOf(second.root), 'ids do not collide between instances');
  assert.equal(first.root.style.getPropertyValue('--tide-wave-fill'), `url(#${idOf(first.root)})`);
  assert.equal(second.root.style.getPropertyValue('--tide-wave-fill'), `url(#${idOf(second.root)})`);
});

// A `fill` presentation attribute loses to any CSS rule, so setting the
// gradient that way means it silently never paints. The stylesheet has to be
// the one that applies it, via the custom property.
test('the gradient reaches the wave through CSS, not a presentation attribute', () => {
  const { root } = mount();
  const front = find(root, bySvgClass('tide__wave--front'));

  assert.equal(front.getAttribute('fill'), null, 'no fill attribute for CSS to override');
  assert.equal(root.style.getPropertyValue('--tide-wave-fill'), `url(#${idOf(root)})`);
});

test('gradient stops take their colour from the stylesheet so dark mode reaches them', () => {
  const { root } = mount();
  const stops = findAll(root, (node) => node.tagName === 'stop');

  assert.equal(stops.length, 2);
  for (const stop of stops) {
    assert.equal(stop.getAttribute('stop-color'), null, 'no hardcoded stop colour');
  }
  assert.ok(find(root, bySvgClass('tide__stop--top')), 'top stop is styleable');
  assert.ok(find(root, bySvgClass('tide__stop--bottom')), 'bottom stop is styleable');
});

test('createTide hides the decorative illustration from assistive tech', () => {
  const { root } = mount();
  const figure = find(root, byClass('tide__figure'));
  assert.equal(figure.getAttribute('aria-hidden'), 'true');
  // ...and keeps the numbers as real text instead.
  assert.match(find(root, byClass('tide__readout')).textContent, /focus minutes today/);
});

// --- createTide: update -----------------------------------------------------

test('createTide starts empty before the first update', () => {
  const { root } = mount();
  assert.equal(levelOf(root), 'translateY(100px)', 'water sits below the view');
  assert.equal(root.getAttribute('data-tide-percent'), '0');
  assert.equal(root.getAttribute('data-tide-state'), 'below-goal');
  assert.equal(find(root, byClass('tide__minutes')).textContent, '0');
});

test('update raises the water level with focused minutes', () => {
  const { root, tide } = mount();

  tide.update({ minutes: 0, goal: 120 });
  assert.equal(levelOf(root), 'translateY(100px)');

  tide.update({ minutes: 60, goal: 120 });
  assert.equal(levelOf(root), 'translateY(50px)');

  tide.update({ minutes: 120, goal: 120 });
  assert.equal(levelOf(root), 'translateY(0px)', 'full tide');
});

test('update caps the level above the goal and still shows the true total', () => {
  const { root, tide } = mount();
  tide.update({ minutes: 310, goal: 120 });

  assert.equal(levelOf(root), 'translateY(0px)', 'level is capped, not overflowing');
  assert.equal(find(root, byClass('tide__minutes')).textContent, '310');
  assert.equal(find(root, byClass('tide__scale')).textContent, 'of 120 focus minutes today');
});

test('update toggles the goal glow at and below the goal', () => {
  const { root, tide } = mount();

  tide.update({ minutes: 119, goal: 120 });
  assert.equal(root.classList.contains('tide--at-goal'), false);
  assert.equal(root.getAttribute('data-tide-state'), 'below-goal');
  assert.equal(find(root, byClass('tide__badge')), null, 'no badge below the goal');

  tide.update({ minutes: 120, goal: 120 });
  assert.equal(root.classList.contains('tide--at-goal'), true, 'exactly the goal counts');
  assert.equal(root.getAttribute('data-tide-state'), 'at-goal');
  assert.equal(find(root, byClass('tide__badge')).textContent, 'Daily goal reached');

  tide.update({ minutes: 10, goal: 120 });
  assert.equal(root.classList.contains('tide--at-goal'), false, 'glow is removed again');
  assert.equal(find(root, byClass('tide__badge')), null, 'badge is detached again');
});

test('repeated at-goal updates attach the badge only once', () => {
  const { root, tide } = mount();
  tide.update({ minutes: 130, goal: 120 });
  tide.update({ minutes: 140, goal: 120 });
  tide.update({ minutes: 150, goal: 120 });

  assert.equal(findAll(root, byClass('tide__badge')).length, 1);
  assert.equal(find(root, byClass('tide__minutes')).textContent, '150');
});

test('update follows an edited daily goal', () => {
  const { root, tide } = mount();

  tide.update({ minutes: 60, goal: 120 });
  assert.equal(levelOf(root), 'translateY(50px)');
  assert.equal(root.classList.contains('tide--at-goal'), false);

  tide.update({ minutes: 60, goal: 60 });
  assert.equal(levelOf(root), 'translateY(0px)');
  assert.equal(root.classList.contains('tide--at-goal'), true);
  assert.equal(find(root, byClass('tide__scale')).textContent, 'of 60 focus minutes today');
});

test('update returns the state so a shell can reuse the wording', () => {
  const { tide } = mount();
  const state = tide.update({ minutes: 90, goal: 120 });
  assert.deepEqual(state, computeTideState({ minutes: 90, goal: 120 }));
  assert.equal(formatTideLabel(state), '90 of 120 focus minutes today. 75% of the daily goal.');
});

test('update survives junk input by falling back to an empty default tide', () => {
  const { root, tide } = mount();
  tide.update({ minutes: 60, goal: 120 });
  tide.update({ minutes: Number.NaN, goal: -1 });

  assert.equal(levelOf(root), 'translateY(100px)');
  assert.equal(find(root, byClass('tide__minutes')).textContent, '0');
  assert.equal(find(root, byClass('tide__scale')).textContent, 'of 120 focus minutes today');
});

// Flex `gap` separates the parts visually, but assistive tech reads the
// serialized text, so the spaces have to be in the DOM too.
test('the readout reads as a sentence, not as run-together words', () => {
  const { root, tide } = mount();
  const readout = () => find(root, byClass('tide__readout')).textContent;

  tide.update({ minutes: 45, goal: 120 });
  assert.equal(readout(), '45 of 120 focus minutes today');

  tide.update({ minutes: 150, goal: 120 });
  assert.equal(readout(), '150 of 120 focus minutes today Daily goal reached');

  tide.update({ minutes: 45, goal: 120 });
  assert.equal(readout(), '45 of 120 focus minutes today', 'the badge spacer is detached too');
});

test('update writes numbers as text, never as markup', () => {
  const { root, tide } = mount();
  tide.update({ minutes: 30, goal: 120 });

  const minutes = find(root, byClass('tide__minutes'));
  assert.equal(minutes.textContent, '30');
  assert.equal(minutes.childNodes.length, 0, 'text only, no parsed child nodes');
});

// --- createTide: destroy ----------------------------------------------------

test('destroy removes the root and leaves the rest of the container intact', () => {
  const doc = createFakeDocument();
  const container = doc.createElement('div');
  const sibling = doc.createElement('p');
  container.appendChild(sibling);
  const tide = createTide(container, { document: doc });

  tide.destroy();

  assert.deepEqual(container.childNodes, [sibling]);
  assert.equal(tide.element.parentNode, null);
});

test('destroy is idempotent and update afterwards is a safe no-op', () => {
  const { container, tide, root } = mount();
  tide.update({ minutes: 60, goal: 120 });

  tide.destroy();
  tide.destroy();

  assert.equal(container.childNodes.length, 0);
  assert.equal(tide.update({ minutes: 120, goal: 120 }), undefined);
  assert.equal(levelOf(root), 'translateY(50px)', 'the detached tree is left untouched');
});
