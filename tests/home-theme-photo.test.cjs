const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('homepage retains responsive daylight and night photos in the same 4:3 frame', () => {
  const figure = homepage.match(/<figure class="home-opening__photograph">([\s\S]*?)<\/figure>/)[1];
  const photos = [...figure.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);

  assert.equal(photos.length, 2);
  assert.match(photos[0], /data-theme-photo="light"/);
  assert.match(photos[1], /data-theme-photo="dark"/);
  assert.match(photos[1], /e4979518bda716a28c4b-800\.webp/);

  for (const photo of photos) {
    const width = Number(photo.match(/\bwidth="(\d+)"/)[1]);
    const height = Number(photo.match(/\bheight="(\d+)"/)[1]);
    assert.equal(width / height, 4 / 3);
    assert.match(photo, /class="no-lightbox"/);
    assert.match(photo, /alt="[^"\n]+"/);
    const variants = photo.match(/srcset="([^"]+)"/)[1].split(',');
    assert.equal(variants.length, 3);
    for (const variant of variants) {
      const src = variant.trim().split(/\s+/)[0];
      assert.ok(fs.existsSync(path.join(root, src)));
    }
  }
});
