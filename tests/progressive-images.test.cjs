const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../static/js/progressive-images.js'), 'utf8');

function setup(tops) {
  const requests = [], events = {};
  const images = tops.map((top, n) => ({
    dataset: { imageVariants: JSON.stringify([400, 800, 1600].map(width => ({ width, src: `${n}-${width}` }))) },
    style: {}, src: 'preview', naturalWidth: 1200, naturalHeight: 900,
    rect: { top, bottom: top + 150, width: 200, height: 150 },
    getBoundingClientRect() { return this.rect; }
  }));
  vm.runInNewContext(source, {
    document: { readyState: 'complete', body: {}, querySelectorAll: () => images, addEventListener: () => {} },
    Image: class { constructor() { requests.push(this); } decode() { return Promise.resolve(); } },
    innerHeight: 800, devicePixelRatio: 2,
    getComputedStyle: () => ({ aspectRatio: 'auto' }),
    addEventListener: (name, fn) => { events[name] = fn; },
    requestAnimationFrame: fn => fn(), MutationObserver: class { observe() {} }
  });
  return { images, requests, events };
}

test('visible images first, two concurrent requests, remaining page loads without scrolling', async () => {
  const { requests, images } = setup([3000, 10, 200, 5000]);
  assert.deepEqual(requests.map(r => r.src), ['1-400', '2-400']);
  await requests[0].onload();
  assert.equal(requests[2].src, '0-400');
  assert.equal(images[1].src, '1-400');
  assert.equal(images[1].style.aspectRatio, '1200 / 900');
  await requests[1].onload();
  assert.equal(requests[3].src, '3-400');
});

test('scroll reprioritises pending images and failures retain previews', async () => {
  const { requests, images, events } = setup([10, 200, 3000, 5000]);
  images[3].rect.top = 0; images[3].rect.bottom = 150;
  events.scroll();
  assert.equal(requests.length, 2);
  requests[0].onerror();
  assert.equal(images[0].src, 'preview');
  assert.equal(requests[2].src, '3-400');
});

test('resize requests a sharper variant without changing layout attributes', async () => {
  const { requests, images, events } = setup([10]);
  await requests[0].onload();
  images[0].rect.width = 500;
  events.resize();
  assert.equal(requests[1].src, '0-1600');
  await requests[1].onload();
  assert.equal(images[0].style.aspectRatio, '1200 / 900');
  assert.equal(images[0].style.width, undefined);
  assert.equal(images[0].style.height, undefined);
});

test('a carousel change cannot be overwritten by an in-flight upgrade', async () => {
  const { requests, images } = setup([10]);
  delete images[0].dataset.imageVariants;
  images[0].src = 'next-slide';
  await requests[0].onload();
  assert.equal(images[0].src, 'next-slide');
});
