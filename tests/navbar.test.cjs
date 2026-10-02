const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const navbar = fs.readFileSync(path.join(__dirname, '../static/navbar.html'), 'utf8');

test('Home precedes the theme button, leaving the toggle at the right edge', () => {
  const links = navbar.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/)[1];
  const items = [...links.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];

  assert.equal(items.length, 2);
  assert.match(items[0][1], /id="nav-home">Home<\/a>/);
  assert.match(items[1][1], /data-theme-toggle/);
});
