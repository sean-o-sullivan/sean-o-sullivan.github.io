const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const solver = fs.readFileSync(path.join(__dirname, '../static/js/fluid-field.js'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../static/js/cursor-ripple.js'), 'utf8');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ fn, options });
  }
  removeEventListener(type, fn) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(l => l.fn !== fn));
  }
  has(type) { return (this.listeners.get(type) || []).length > 0; }
  dispatch(type, event = {}) {
    for (const { fn } of [...(this.listeners.get(type) || [])]) fn(event);
  }
}

class Element extends Target {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.attributes = {};
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.className = '';
    this.width = 300;
    this.height = 150;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  append(...nodes) { nodes.forEach(node => { node.parentNode = this; this.children.push(node); }); }
  insertBefore(node, before) {
    const index = this.children.indexOf(before);
    node.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
  }
  closest() { return null; }
  all(predicate, found = []) {
    for (const child of this.children) {
      if (predicate(child)) found.push(child);
      child.all(predicate, found);
    }
    return found;
  }
}

// Just enough WebGL2 for the light layer.
function fakeGl(canvas, log) {
  const gl = {
    canvas, lost: false, heights: null,
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, TEXTURE_2D: 7, TEXTURE_MIN_FILTER: 8,
    TEXTURE_MAG_FILTER: 9, LINEAR: 10, TEXTURE_WRAP_S: 11, TEXTURE_WRAP_T: 12,
    CLAMP_TO_EDGE: 13, TEXTURE0: 14, R16F: 15, RED: 16, FLOAT: 17,
    COLOR_BUFFER_BIT: 18, TRIANGLES: 19,
    isContextLost() { return gl.lost; }
  };
  const noop = name => (...args) => { log.push(name); return name === 'getShaderParameter' || name === 'getProgramParameter' ? true : {}; };
  for (const name of ['createShader', 'shaderSource', 'compileShader', 'getShaderParameter',
    'getShaderInfoLog', 'createProgram', 'attachShader', 'bindAttribLocation', 'linkProgram',
    'getProgramParameter', 'getProgramInfoLog', 'getUniformLocation', 'createBuffer',
    'bindBuffer', 'bufferData', 'createTexture', 'bindTexture', 'texParameteri', 'viewport',
    'useProgram', 'activeTexture', 'texImage2D', 'texSubImage2D', 'uniform1i', 'uniform2f',
    'uniform3f', 'enableVertexAttribArray', 'vertexAttribPointer', 'clearColor', 'clear',
    'drawArrays']) gl[name] = noop(name);
  for (const name of ['texImage2D', 'texSubImage2D']) {
    gl[name] = (...args) => {
      log.push(name);
      gl.heights = Float32Array.from(args.at(-1));
    };
  }
  return gl;
}

function setup({ reduced = false, fine = true, chromium = true, backdrop = true, webgl = true,
  width = 1200, height = 800 } = {}) {
  const frames = new Map();
  let nextFrame = 1;
  const glLog = [];
  const contexts = [];
  const media = query => Object.assign(new Target(), {
    matches: query.includes('reduced-motion') ? reduced : fine
  });
  const motion = media('reduced-motion');
  const pointer = media('pointer');
  const root = new Element('html');
  root.dataset = { theme: 'light' };
  root.clientWidth = width;
  root.clientHeight = height;
  const body = new Element('body');
  const document = Object.assign(new Target(), {
    hidden: false,
    documentElement: root,
    body,
    createElement(tag) {
      const element = new Element(tag);
      if (tag === 'canvas') {
        element.getContext = kind => {
          if (!webgl || kind !== 'webgl2') return null;
          const gl = fakeGl(element, glLog);
          contexts.push(gl);
          return gl;
        };
      }
      return element;
    },
    createElementNS(ns, tag) { const element = new Element(tag); element.namespaceURI = ns; return element; }
  });
  const context = Object.assign(new Target(), {
    document,
    navigator: chromium ? { userAgentData: { brands: [{ brand: 'Chromium', version: '140' }] } } : {},
    CSS: {
      supports(property, value) {
        if (property.includes('backdrop-filter')) return backdrop && (value.startsWith('blur') || value.startsWith('url'));
        return property === 'clip-path';
      }
    },
    matchMedia: query => query.includes('reduced-motion') ? motion : pointer,
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    innerWidth: width,
    innerHeight: height,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 2,
    WebGL2RenderingContext: webgl ? function WebGL2RenderingContext() {} : undefined,
    Float32Array, Map, Number, Math, Object, Array, String, Error, JSON
  });
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(solver, context);
  vm.runInContext(script, context);

  let clock = 1000;
  const move = (x, y, extra = {}) => {
    clock += 8;
    let prevented = false;
    context.dispatch('pointermove', {
      pointerType: 'mouse', buttons: 0, clientX: x, clientY: y, timeStamp: clock,
      target: { closest: () => null }, preventDefault() { prevented = true; }, ...extra
    });
    return prevented;
  };
  const tick = (ms = 16.7) => {
    clock += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(fn => fn(clock));
    return pending.length;
  };
  const sweep = (x0, x1, y = 400, steps = 40) => {
    for (let k = 0; k <= steps; k++) {
      move(x0 + (x1 - x0) * k / steps, y);
      if (k % 2) tick(8);
    }
  };
  const settle = (limit = 900) => {
    let n = 0;
    while (frames.size && n < limit) { tick(); n++; }
    return n;
  };
  const nodes = () => body.all(() => true);
  const visible = () => body.children.filter(node => !node.hidden && node.tagName !== 'svg');
  return { context, document, body, root, motion, pointer, frames, move, tick, sweep, settle,
  nodes, visible, contexts, glLog, advance: ms => { clock += ms; } };
}

test('sparse slow pointer samples do not flash the surface between frames', t => {
  const page = setup();
  let previous = null, changes = 0, magnitude = 0;
  // 30px/s, integer-pixel events at 30Hz, display at 60Hz.
  for (let k = 0; k < 180; k++) {
    if (k % 2 === 0) page.move(300 + k / 2, 300);
    page.tick(k % 2 === 0 ? 1000 / 60 - 8 : 1000 / 60);
    const heights = page.contexts[0]?.heights;
    if (!heights) continue;
    if (k > 30 && previous) {
      for (let c = 0; c < heights.length; c++) {
        changes += Math.abs(heights[c] - previous[c]);
        magnitude += Math.abs(heights[c]);
      }
    }
    previous = heights;
  }
  assert.ok(magnitude > 0, 'slow motion remains visible');
  t.diagnostic(`relative surface variation: ${(changes / magnitude).toFixed(3)}`);
  assert.ok(changes / magnitude < 0.3, `relative frame variation ${changes / magnitude}`);
});

test('no listener for reduced motion, touch-only devices or browsers without either layer', () => {
  for (const options of [{ reduced: true }, { fine: false }, { backdrop: false, webgl: false }]) {
    const page = setup(options);
    assert.equal(page.context.has('pointermove'), false, JSON.stringify(options));
    page.move(10, 10);
    page.move(400, 10);
    assert.equal(page.frames.size, 0);
    assert.equal(page.nodes().length, 0);
  }
});

test('passive, never intercepts input, and adds only hidden decorative layers', () => {
  const page = setup();
  const listener = page.context.listeners.get('pointermove')[0];
  assert.equal(listener.options.passive, true);
  assert.equal(page.nodes().length, 0, 'nothing is created before the first stroke');
  let prevented = false;
  for (let k = 0; k < 30; k++) { prevented ||= page.move(200 + k * 20, 300); page.tick(8); }
  assert.equal(prevented, false);
  const top = page.body.children;
  assert.ok(top.length >= 2);
  for (const node of top) {
    assert.equal(node.getAttribute('aria-hidden'), 'true');
    assert.equal(node.getAttribute('tabindex'), null);
  }
  const svg = top.find(node => node.tagName === 'svg');
  assert.equal(svg.getAttribute('focusable'), 'false');
  for (const type of ['click', 'pointerdown', 'mousedown', 'keydown', 'wheel', 'touchstart',
    'selectstart', 'scroll']) {
    assert.equal(page.context.has(type) || page.document.has(type), false, type);
  }
});

test('touch, pen, pressed buttons (selection), controls and hidden tabs do not stir', () => {
  const page = setup();
  const strokes = [
    { pointerType: 'touch' },
    { pointerType: 'pen' },
    { buttons: 1 },
    { target: { closest: () => ({}) } }
  ];
  for (const extra of strokes) {
    for (let k = 0; k < 20; k++) page.move(100 + k * 30, 200, extra);
  }
  page.document.hidden = true;
  for (let k = 0; k < 20; k++) page.move(100 + k * 30, 300);
  assert.equal(page.frames.size, 0);
  assert.equal(page.nodes().length, 0);
});

test('Chromium refracts the page through a bounded, finite displacement map', () => {
  const page = setup();
  page.sweep(100, 1100, 400);
  page.tick();
  const filter = page.nodes().find(node => node.tagName === 'filter');
  assert.ok(filter);
  assert.equal(filter.id, 'cursor-wake-refraction');
  const surface = page.body.children.find(node => node.className === 'cursor-wake');
  assert.equal(surface.style.backdropFilter, 'url(#cursor-wake-refraction)');
  assert.equal(surface.hidden, false);
  assert.ok(filter.all(node => node.tagName === 'feDisplacementMap').length === 1);

  // A storm across the whole viewport still uses a capped number of blocks.
  for (let k = 0; k < 12; k++) page.sweep(k % 2 ? 1150 : 50, k % 2 ? 50 : 1150, 60 + k * 60, 30);
  page.tick();
  const floods = filter.all(node => node.tagName === 'feFlood');
  assert.ok(floods.length <= 421, `${floods.length} floods`);
  for (const flood of floods) {
    for (const name of ['x', 'y', 'width', 'height']) {
      assert.ok(Number.isFinite(Number(flood.getAttribute(name))), `${name}=${flood.getAttribute(name)}`);
    }
    const rgb = flood.getAttribute('flood-color').match(/\d+/g).map(Number);
    assert.ok(rgb.length === 3 && rgb.every(c => c >= 0 && c <= 255));
  }
});

test('other browsers get blur clipped to contours of the same field, never url() filters', () => {
  const page = setup({ chromium: false });
  page.sweep(100, 1100, 400);
  page.tick();
  assert.equal(page.nodes().some(node => node.tagName === 'filter'), false);
  const soft = page.body.children.filter(node => node.className.includes('cursor-wake--soft'));
  assert.equal(soft.length, 2);
  const shown = soft.filter(node => !node.hidden);
  assert.ok(shown.length >= 1);
  for (const node of shown) {
    assert.match(node.style.backdropFilter, /^blur\(/);
    const clip = node.style.clipPath;
    assert.match(clip, /^path\('M/);
    const numbers = clip.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(numbers.every(Number.isFinite));
    assert.ok((clip.match(/Q/g) || []).length <= 1000, 'contour work is bounded');
    assert.equal(clip.includes('NaN'), false);
  }
});

test('one frame at a time, and the loop stops itself once the water is still', () => {
  const page = setup();
  page.sweep(100, 1100, 400);
  assert.ok(page.frames.size <= 1);
  const frames = page.settle();
  assert.equal(page.frames.size, 0, 'no idle loop');
  assert.ok(frames < 600, `settled after ${frames} frames`);
  assert.deepEqual(page.visible(), [], 'nothing left on screen');
  // Next stroke starts it again.
  page.sweep(200, 600, 300);
  assert.equal(page.frames.size, 1);
});

test('scrolling carries the wake with the page; a jump clears it', () => {
  const page = setup();
  page.sweep(100, 1100, 400);
  page.context.scrollY = 120;
  page.tick();
  assert.equal(page.frames.size, 1, 'small scroll keeps the water moving');
  assert.ok(page.visible().length > 0);
  page.context.scrollY = 3000;
  page.tick();
  assert.equal(page.frames.size, 0);
  assert.deepEqual(page.visible(), []);
});

test('resize, hidden tabs and page hide stop immediately; blur and leaving only lift the stick', () => {
  for (const [owner, type, before] of [
    ['window', 'resize'], ['window', 'pagehide'],
    ['document', 'visibilitychange', page => { page.document.hidden = true; }]
  ]) {
    const page = setup();
    page.sweep(100, 1100, 400);
    page.tick();
    if (before) before(page);
    (owner === 'window' ? page.context : page.document).dispatch(type);
    page.tick();
    assert.equal(page.frames.size, 0, type);
    assert.deepEqual(page.visible(), [], type);
  }
  for (const [owner, type] of [['window', 'blur'], ['root', 'pointerleave']]) {
    const page = setup();
    page.sweep(100, 1100, 400);
    (owner === 'window' ? page.context : page.root).dispatch(type);
    assert.equal(page.frames.size, 1, `${type}: the wake keeps evolving`);
    assert.ok(page.settle() < 600);
    assert.equal(page.frames.size, 0);
  }
});

test('reduced motion turned on mid-wake cancels everything; turning it off restores it', () => {
  const page = setup();
  page.sweep(100, 1100, 400);
  page.motion.matches = true;
  page.motion.dispatch('change');
  assert.equal(page.context.has('pointermove'), false);
  assert.equal(page.frames.size, 0);
  assert.deepEqual(page.visible(), []);
  page.motion.matches = false;
  page.motion.dispatch('change');
  assert.equal(page.context.has('pointermove'), true);
});

test('losing the graphics context hides the light layer and leaves the page effect working', () => {
  const page = setup();
  page.sweep(100, 1100, 400);
  page.tick();
  const canvas = page.body.children.find(node => node.tagName === 'canvas');
  assert.equal(canvas.hidden, false);
  let defaulted = false;
  page.contexts[0].lost = true;
  canvas.dispatch('webglcontextlost', { preventDefault() { defaulted = true; } });
  assert.equal(defaulted, true, 'asks the browser to allow a restore');
  page.sweep(200, 900, 300);
  page.tick();
  assert.equal(canvas.hidden, true);
  assert.equal(page.body.children.find(node => node.className === 'cursor-wake').hidden, false);
  page.contexts[0].lost = false;
  canvas.dispatch('webglcontextrestored');
  page.sweep(900, 200, 350);
  page.tick();
  assert.equal(canvas.hidden, false);
});

test('without WebGL2 the page effect still runs; without backdrop-filter the light still runs', () => {
  const noGl = setup({ webgl: false });
  noGl.sweep(100, 1100, 400);
  noGl.tick();
  assert.equal(noGl.body.children.some(node => node.tagName === 'canvas'), false);
  assert.ok(noGl.visible().some(node => node.className === 'cursor-wake'));

  const noBackdrop = setup({ backdrop: false });
  noBackdrop.sweep(100, 1100, 400);
  noBackdrop.tick();
  assert.equal(noBackdrop.nodes().some(node => node.className.startsWith('cursor-wake ')), false);
  assert.ok(noBackdrop.visible().some(node => node.tagName === 'canvas'));
});

test('long frame gaps and stalled pointers do not inject runaway motion', () => {
  const page = setup();
  page.sweep(100, 600, 400);
  page.tick(4000);          // a stalled tab or long task
  page.advance(500);        // pointer resumes far away after a pause
  page.move(1150, 50);
  page.move(1150, 60);
  for (let k = 0; k < 5; k++) page.tick(16.7);
  const filter = page.nodes().find(node => node.tagName === 'filter');
  for (const flood of filter.all(node => node.tagName === 'feFlood')) {
    const rgb = flood.getAttribute('flood-color').match(/\d+/g).map(Number);
    assert.ok(rgb.every(Number.isFinite));
  }
  assert.ok(page.settle() < 600);
});
