// Focus Tide — tide illustration component (task 4).
//
// A calm wave whose water level rises with today's focused minutes toward the
// daily goal. At or above the goal the wave gains a soft glow.
//
// No dependencies, no external assets: the illustration is inline SVG built
// with DOM calls (never innerHTML) and styled by styles/tide.css.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const DEFAULT_GOAL = 120;

// Illustration geometry, in viewBox units.
const VIEW = 100;
const WAVE_SPAN = 200; // twice the view width, so the drift animation can loop
const WAVE_DEPTH = 260; // water body extends well below the view

let instanceCount = 0;

function toNonNegativeNumber(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function toPositiveNumber(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number;
}

/**
 * Normalize the numeric inputs into everything the view needs.
 *
 * `minutes` stays truthful above the goal — only `ratio` is clamped, so the
 * water can be full while the readout still says "180 of 120".
 */
export function computeTideState(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const minutes = toNonNegativeNumber(source.minutes, 0);
  const goal = toPositiveNumber(source.goal, DEFAULT_GOAL);
  const ratio = Math.min(minutes / goal, 1);
  return {
    minutes,
    goal,
    ratio,
    percent: Math.round(ratio * 100),
    atGoal: minutes >= goal,
  };
}

function formatMinutes(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/** One-line accessible summary of the tide. */
export function formatTideLabel(state) {
  const minutes = formatMinutes(state.minutes);
  const goal = formatMinutes(state.goal);
  return state.atGoal
    ? `${minutes} of ${goal} focus minutes today. Daily goal reached.`
    : `${minutes} of ${goal} focus minutes today. ${state.percent}% of the daily goal.`;
}

/**
 * Build a closed wave path: a sine-ish top edge over `span`, then straight
 * sides down to `depth`. The first crest points up when `crestFirst` is true.
 */
export function buildWavePath({
  baseline = 6,
  amplitude = 2.5,
  period = 50,
  span = WAVE_SPAN,
  depth = WAVE_DEPTH,
  crestFirst = true,
} = {}) {
  const half = period / 2;
  let direction = crestFirst ? -1 : 1;
  let path = `M 0 ${baseline}`;
  for (let x = 0; x < span; x += half) {
    const controlX = x + half / 2;
    // A quadratic control at 2x amplitude puts the curve's midpoint at exactly
    // `amplitude` away from the baseline.
    const controlY = baseline + direction * amplitude * 2;
    path += ` Q ${controlX} ${controlY} ${x + half} ${baseline}`;
    direction *= -1;
  }
  return `${path} L ${span} ${depth} L 0 ${depth} Z`;
}

function svg(doc, tag, attributes) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function resolveDocument(container, options) {
  const doc = options.document || container.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElementNS !== 'function') {
    throw new TypeError('createTide: no document available to render into');
  }
  return doc;
}

function buildWaterGradient(doc, id) {
  const gradient = svg(doc, 'linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.appendChild(svg(doc, 'stop', { offset: '0', 'stop-color': 'var(--tide-water-top)' }));
  gradient.appendChild(svg(doc, 'stop', { offset: '1', 'stop-color': 'var(--tide-water-bottom)' }));
  return gradient;
}

/**
 * Mount the tide illustration inside `container`.
 *
 * The component appends its own root element and never clears the container,
 * so a page shell can compose other content around it.
 *
 * @param {Element} container
 * @param {{document?: Document}} [options]
 * @returns {{update: (input?: {minutes?: number, goal?: number}) => (object|undefined), destroy: () => void, element: Element}}
 */
export function createTide(container, options = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new TypeError('createTide: container must be a DOM element');
  }
  const doc = resolveDocument(container, options);
  const gradientId = `tide-water-${(instanceCount += 1)}`;

  const root = doc.createElement('div');
  root.classList.add('tide');

  const figure = doc.createElement('div');
  figure.classList.add('tide__figure');
  // The illustration restates the readout below it, so it is decorative.
  figure.setAttribute('aria-hidden', 'true');

  const canvas = svg(doc, 'svg', {
    class: 'tide__svg',
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    // Stretching the wave to the container keeps the water surface level at
    // any aspect ratio, which matters on narrow phone columns.
    preserveAspectRatio: 'none',
    focusable: 'false',
  });

  const defs = svg(doc, 'defs', {});
  defs.appendChild(buildWaterGradient(doc, gradientId));
  canvas.appendChild(defs);

  canvas.appendChild(svg(doc, 'rect', { class: 'tide__sky', x: 0, y: 0, width: VIEW, height: VIEW }));

  const water = svg(doc, 'g', { class: 'tide__water' });
  water.appendChild(
    svg(doc, 'path', {
      class: 'tide__wave tide__wave--back',
      d: buildWavePath({ baseline: 9, amplitude: 3, period: 50, crestFirst: false }),
    }),
  );
  water.appendChild(
    svg(doc, 'path', {
      class: 'tide__wave tide__wave--front',
      d: buildWavePath({ baseline: 6, amplitude: 2.5, period: 50, crestFirst: true }),
      fill: `url(#${gradientId})`,
    }),
  );
  canvas.appendChild(water);
  figure.appendChild(canvas);

  const readout = doc.createElement('p');
  readout.classList.add('tide__readout');

  const minutesEl = doc.createElement('span');
  minutesEl.classList.add('tide__minutes');

  const scaleEl = doc.createElement('span');
  scaleEl.classList.add('tide__scale');

  const badge = doc.createElement('span');
  badge.classList.add('tide__badge');
  badge.textContent = 'Daily goal reached';

  // Flex `gap` spaces these visually, but a screen reader reads the serialized
  // text, which would otherwise run together as "150of 120 focus minutes".
  // Whitespace-only nodes between flex items are not rendered, so these cost
  // nothing visually.
  const badgeSpace = doc.createTextNode(' ');

  readout.appendChild(minutesEl);
  readout.appendChild(doc.createTextNode(' '));
  readout.appendChild(scaleEl);

  root.appendChild(figure);
  root.appendChild(readout);
  container.appendChild(root);

  let destroyed = false;
  let badgeAttached = false;

  function update(input) {
    if (destroyed) return;
    const state = computeTideState(input);

    // px here are viewBox user units, and the CSS transition on .tide__water
    // turns a level change into a rise rather than a jump.
    water.style.transform = `translateY(${(1 - state.ratio) * VIEW}px)`;
    root.classList[state.atGoal ? 'add' : 'remove']('tide--at-goal');
    root.setAttribute('data-tide-percent', String(state.percent));
    root.setAttribute('data-tide-state', state.atGoal ? 'at-goal' : 'below-goal');

    // Numbers only, set as text — no markup is ever interpolated.
    minutesEl.textContent = formatMinutes(state.minutes);
    scaleEl.textContent = `of ${formatMinutes(state.goal)} focus minutes today`;

    if (state.atGoal && !badgeAttached) {
      readout.appendChild(badgeSpace);
      readout.appendChild(badge);
      badgeAttached = true;
    } else if (!state.atGoal && badgeAttached) {
      readout.removeChild(badgeSpace);
      readout.removeChild(badge);
      badgeAttached = false;
    }

    // Returned so a page shell can reuse the same wording in a polite status
    // region without recomputing it.
    return state;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  update({});

  return { update, destroy, element: root };
}
