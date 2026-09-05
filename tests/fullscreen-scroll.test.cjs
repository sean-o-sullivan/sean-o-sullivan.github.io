const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../static/js/project-page.js'), 'utf8');

class BrowserEvent {
  constructor(type, properties = {}) {
    this.type = type;
    Object.assign(this, properties);
  }
}

class EventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, callback, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, capture: options === true || Boolean(options.capture), once: options.once });
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target ||= this;
    const listeners = [...(this.listeners.get(event.type) || [])];
    listeners.sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const listener of listeners) {
      listener.callback(event);
      if (listener.once) {
        this.listeners.set(event.type, this.listeners.get(event.type).filter(item => item !== listener));
      }
    }
    return true;
  }
}

// The browser owns viewport/scroll changes. The test clock controls when its
// animation frames run; responsive placement is represented by a layout callback.
function browser({ width = 1000, height = 800, x = 0, y = 2400, mediaTop = 2700 } = {}) {
  let now = 0;
  let nextFrame = 0;
  let nextTimer = 0;
  const frames = new Map();
  const timers = new Map();
  const document = new EventTarget();
  const window = new EventTarget();
  const scrolls = [];
  const focusCalls = [];
  const media = [];
  Object.assign(window, {
    innerWidth: width,
    innerHeight: height,
    scrollX: x,
    scrollY: y,
    location: { pathname: '/fullscreen-test/' },
    visualViewport: new EventTarget()
  });

  class Video extends EventTarget {
    constructor(top) {
      super();
      this.documentTop = top;
      this.isConnected = true;
      media.push(this);
    }
    closest(selector) { return this.matches(selector) ? this : null; }
    matches(selector) { return selector.split(',').map(value => value.trim()).includes('video'); }
    getBoundingClientRect() { return { top: this.documentTop - window.scrollY }; }
    focus(options) { focusCalls.push({ media: this, preventScroll: options?.preventScroll }); }
  }

  const video = new Video(mediaTop);
  const dispatch = (target, type, properties) => target.dispatchEvent(new BrowserEvent(type, properties));
  const setScroll = (top, left = window.scrollX) => {
    window.scrollX = left;
    window.scrollY = top;
    dispatch(window, 'scroll');
  };
  window.scrollTo = options => {
    scrolls.push({ left: options.left, top: options.top, behavior: options.behavior });
    setScroll(options.top, options.left);
  };
  Object.assign(document, {
    fullscreenElement: null,
    webkitFullscreenElement: null,
    documentElement: { scrollHeight: 20000 },
    readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: selector => selector === 'video, iframe' ? media : []
  });
  const requestAnimationFrame = callback => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = id => frames.delete(id);
  const setTimeout = (callback, milliseconds = 0, ...args) => {
    const id = ++nextTimer;
    timers.set(id, { at: now + Math.max(0, milliseconds), callback: () => callback(...args) });
    return id;
  };
  const clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = requestAnimationFrame;
  window.cancelAnimationFrame = cancelAnimationFrame;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  vm.runInNewContext(script, {
    window, document, Event: BrowserEvent, HTMLVideoElement: Video,
    performance: { now: () => now }, requestAnimationFrame, cancelAnimationFrame,
    setTimeout, clearTimeout
  }, { filename: 'static/js/project-page.js' });

  const step = (milliseconds = 16) => {
    const end = now + milliseconds;
    for (let runs = 0; runs < 1000; runs++) {
      const due = [...timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      now = timer.at;
      timer.callback();
      assert.notEqual(runs, 999, 'timer callbacks must not loop indefinitely');
    }
    now = end;
    const pending = [...frames];
    for (const [id, callback] of pending) {
      if (!frames.delete(id)) continue;
      callback(now);
    }
  };
  const advance = milliseconds => {
    const end = now + milliseconds;
    while (now < end) step(Math.min(16, end - now));
  };
  const resize = (newWidth, newHeight) => {
    window.innerWidth = newWidth;
    window.innerHeight = newHeight;
    dispatch(window, 'resize');
  };
  const enter = (target = video, { pointer = true, webkit = false } = {}) => {
    if (pointer) dispatch(document, 'pointerdown', { target });
    if (webkit) {
      target.webkitDisplayingFullscreen = true;
      dispatch(document, 'webkitbeginfullscreen', { target });
    } else {
      document.fullscreenElement = target;
      dispatch(document, 'fullscreenchange', { target });
    }
  };
  const exit = ({ webkit = false } = {}) => {
    if (webkit) {
      video.webkitDisplayingFullscreen = false;
      dispatch(document, 'webkitendfullscreen', { target: video });
    } else {
      document.fullscreenElement = null;
      dispatch(document, 'fullscreenchange', { target: video });
    }
  };
  return {
    window, document, video, scrolls, focusCalls, dispatch, setScroll, resize, enter, exit,
    step, advance, addVideo: top => new Video(top),
    transitioning: () => window.PortfolioFullscreen.isTransitioning()
  };
}

test('delayed native exit waits for the original viewport before restoring a reset scroll', () => {
  const b = browser({ x: 18, y: 4300, mediaTop: 4600 });
  b.advance(32);
  b.enter();
  b.resize(1920, 1080);
  b.setScroll(0, 0);
  b.exit();
  b.advance(1000);
  assert.equal(b.transitioning(), true);
  assert.equal(b.scrolls.length, 0);
  b.resize(1000, 800);
  b.advance(160);
  assert.equal(b.scrolls.length, 0);
  b.advance(64);
  assert.equal(b.transitioning(), false);
  assert.deepEqual(b.scrolls, [{ left: 18, top: 4300, behavior: 'instant' }]);
  assert.equal(b.focusCalls[0].preventScroll, true);
});

test('native controls without DOM pointer events use the last inline scroll position', () => {
  const b = browser({ y: 0 });
  const second = b.addVideo(5900);
  b.advance(16);
  b.setScroll(5550);
  b.advance(16);
  // The native UI changes the document before reporting fullscreen entry.
  b.setScroll(0);
  b.resize(1920, 1080);
  b.enter(second, { pointer: false });
  b.advance(32);
  b.exit();
  b.resize(1000, 800);
  b.advance(240);
  assert.equal(b.window.scrollY, 5550);
  assert.equal(b.focusCalls[0].media, second);
});

test('same-size fullscreen exits recover scroll without waiting for a resize event', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(160);
  assert.equal(b.scrolls.length, 0);
  b.advance(64);
  assert.equal(b.window.scrollY, 2400);
  assert.equal(b.scrolls.length, 1);
});

test('visual viewport movement extends exit settling even when window dimensions match', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(160);
  b.dispatch(b.window.visualViewport, 'resize');
  b.advance(160);
  assert.equal(b.scrolls.length, 0);
  b.advance(64);
  assert.equal(b.window.scrollY, 2400);
});

test('rotation restores the video anchor after responsive placement callbacks', () => {
  const b = browser({ width: 800, height: 1000, y: 3000, mediaTop: 3250 });
  b.advance(16);
  let placed = false;
  b.document.addEventListener('portfolio-fullscreen-restored', () => {
    assert.equal(b.transitioning(), false, 'placement must be allowed at this event');
    b.video.documentTop = 1800;
    placed = true;
  });
  b.enter();
  b.resize(1200, 800);
  b.setScroll(0);
  b.exit();
  b.advance(1900);
  assert.equal(b.scrolls.length, 0);
  b.advance(160);
  assert.equal(placed, true);
  assert.equal(b.window.scrollY, 1550);
  assert.equal(b.video.getBoundingClientRect().top, 250);
  b.advance(160);
  b.setScroll(0);
  b.advance(32);
  assert.equal(b.video.getBoundingClientRect().top, 250, 'late resets must preserve the rotated anchor');
});

test('WebKit begin/end events recover position without document.fullscreenElement', () => {
  const b = browser({ y: 7100, mediaTop: 7300 });
  b.advance(16);
  b.enter(b.video, { webkit: true });
  assert.equal(b.document.fullscreenElement, null);
  assert.equal(b.transitioning(), true);
  b.resize(1920, 1080);
  b.setScroll(0);
  b.exit({ webkit: true });
  b.advance(400);
  assert.equal(b.scrolls.length, 0);
  b.resize(1000, 800);
  b.advance(240);
  assert.equal(b.window.scrollY, 7100);
});

for (const type of ['wheel', 'touchmove']) {
  test(`${type} during exit keeps the user's new reading position`, () => {
    const b = browser();
    b.advance(16);
    b.enter();
    b.setScroll(0);
    b.exit();
    b.advance(64);
    b.dispatch(b.window, type);
    b.setScroll(700);
    b.advance(240);
    assert.equal(b.window.scrollY, 700);
    assert.equal(b.scrolls.length, 0);
    assert.equal(b.transitioning(), false);
  });
}

test('keyboard navigation during exit cancels the saved scroll', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.dispatch(b.document, 'keydown', { target: b.video, key: 'PageDown' });
  b.setScroll(800);
  b.advance(240);
  assert.equal(b.window.scrollY, 800);
  assert.equal(b.scrolls.length, 0);
});

test('page navigation cancels all pending restoration work', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(80);
  b.dispatch(b.window, 'pagehide');
  b.advance(2400);
  assert.equal(b.transitioning(), false);
  assert.equal(b.scrolls.length, 0);
  assert.equal(b.focusCalls.length, 0);
});

test('same-document history navigation is not overwritten by pending restoration', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(64);
  b.dispatch(b.window, 'popstate');
  b.dispatch(b.window, 'hashchange');
  b.setScroll(900);
  b.advance(240);
  assert.equal(b.window.scrollY, 900);
  assert.equal(b.scrolls.length, 0);
});

for (const type of ['wheel', 'pointerdown', 'pagehide']) {
  test(`${type} after layout restoration still cancels the pending scroll frame`, () => {
    const b = browser();
    b.advance(16);
    let layoutRestored = false;
    b.document.addEventListener('portfolio-fullscreen-restored', () => { layoutRestored = true; });
    b.enter();
    b.setScroll(0);
    b.exit();
    for (let steps = 0; !layoutRestored && steps < 140; steps++) b.step();
    assert.equal(layoutRestored, true);
    assert.equal(b.scrolls.length, 0);
    b.dispatch(type === 'pointerdown' ? b.document : b.window, type, { target: b.video });
    b.setScroll(650);
    b.advance(32);
    assert.equal(b.window.scrollY, 650);
    assert.equal(b.scrolls.length, 0);
  });
}

test('another fullscreen entry supersedes an old pending restoration', () => {
  const b = browser();
  const second = b.addVideo(1500);
  b.advance(16);
  let layoutRestored = false;
  b.document.addEventListener('portfolio-fullscreen-restored', () => { layoutRestored = true; });
  b.enter();
  b.setScroll(0);
  b.exit();
  for (let steps = 0; !layoutRestored && steps < 140; steps++) b.step();
  assert.equal(layoutRestored, true);
  b.setScroll(900);
  b.enter(second);
  b.advance(32);
  assert.equal(b.transitioning(), true);
  assert.equal(b.scrolls.length, 0);
  b.setScroll(0);
  b.exit();
  b.advance(240);
  assert.equal(b.window.scrollY, 900);
  assert.equal(b.focusCalls.length, 1);
  assert.equal(b.focusCalls[0].media, second);
});

test('a disconnected video is not focused or scrolled back into view', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.video.isConnected = false;
  b.advance(240);
  assert.equal(b.scrolls.length, 0);
  assert.equal(b.focusCalls.length, 0);
});

test('repeated native round trips preserve each newly chosen reading position', () => {
  const b = browser();
  b.advance(16);
  for (const y of [2400, 3600, 5200]) {
    b.video.documentTop = y + 250;
    b.dispatch(b.window, 'wheel');
    b.setScroll(y);
    b.advance(32);
    b.enter(b.video, { pointer: false });
    b.resize(1920, 1080);
    b.setScroll(0);
    b.exit();
    b.resize(1000, 800);
    b.advance(240);
    assert.equal(b.window.scrollY, y);
    assert.equal(b.transitioning(), false);
  }
  assert.deepEqual(b.scrolls.map(scroll => scroll.top), [2400, 3600, 5200]);
});

test('a native scroll reset 400ms after exit is corrected after the first restoration', () => {
  const b = browser({ y: 4300, mediaTop: 4600 });
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(240);
  assert.equal(b.window.scrollY, 4300);
  assert.equal(b.scrolls.length, 1);
  b.advance(160);
  b.setScroll(0);
  b.advance(32);
  assert.equal(b.window.scrollY, 4300);
  assert.equal(b.scrolls.at(-1).behavior, 'instant');
});

test('late smooth-scroll updates are interrupted without creating a scroll feedback loop', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(400);
  for (const top of [1800, 900, 0]) {
    b.setScroll(top);
    b.advance(32);
    assert.equal(b.window.scrollY, 2400);
    assert.equal(b.scrolls.at(-1).behavior, 'instant');
  }
  const correctionCount = b.scrolls.length;
  b.advance(400);
  assert.equal(b.scrolls.length, correctionCount, 'restoration-generated scroll events must not keep scrolling');
});

for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown', 'hashchange', 'popstate', 'pagehide']) {
  test(`${type} after the first restoration ends recovery and respects the new position`, () => {
    const b = browser();
    b.advance(16);
    b.enter();
    b.setScroll(0);
    b.exit();
    b.advance(240);
    assert.equal(b.window.scrollY, 2400);
    const previousWrites = b.scrolls.length;
    const target = ['pointerdown', 'keydown'].includes(type) ? b.document : b.window;
    b.dispatch(target, type, { target: b.video, key: 'PageDown' });
    b.setScroll(650);
    b.advance(1800);
    assert.equal(b.window.scrollY, 650);
    assert.equal(b.scrolls.length, previousWrites);
  });
}

test('automatic recovery expires instead of pinning the page indefinitely', () => {
  const b = browser();
  b.advance(16);
  b.enter();
  b.setScroll(0);
  b.exit();
  b.advance(240);
  assert.equal(b.window.scrollY, 2400);
  b.advance(1600);
  const previousWrites = b.scrolls.length;
  b.setScroll(880);
  b.advance(240);
  assert.equal(b.window.scrollY, 880);
  assert.equal(b.scrolls.length, previousWrites);
});
