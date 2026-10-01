const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require(path.join(__dirname, '../static/js/fluid-field.js'));
const { create } = globalThis.FluidField;

const lerp = (a, b, t) => a + (b - a) * t;

// Feed a pointer path (t -> [x, y] or null when lifted) the way the page
// does: ~120 Hz samples, segments shorter than the stroke gap, 60 Hz steps.
function drive(field, route, seconds, each, { fps = 60, hz = 120, start = 0 } = {}) {
  const dt = 1 / fps;
  let previous = null;
  let t = start;
  while (t < start + seconds - 1e-9) {
    for (let k = Math.round(t * hz) + 1; k <= Math.round((t + dt) * hz); k++) {
      const time = k / hz;
      const point = route(time);
      if (point && previous && time - previous[2] < 0.11) {
        field.stir(previous[0], previous[1], point[0], point[1], time - previous[2]);
      } else if (point) {
        field.lift(0.3);
      }
      previous = point ? [point[0], point[1], time] : null;
    }
    t += dt;
    field.step(dt);
    if (each) each(t, field);
  }
  return t;
}

const at = (field, name, x, y) => {
  const i = Math.min(field.nx - 1, Math.max(0, Math.floor(x / field.h)));
  const j = Math.min(field.ny - 1, Math.max(0, Math.floor(y / field.h)));
  return field.out[name][j * field.nx + i];
};

const finite = field => ['u', 'v', 'pressure', 'curl']
  .every(name => field.out[name].every(Number.isFinite));

// Strongest positive and negative vorticity locations.
const cores = field => {
  let hi = -Infinity, lo = Infinity, a = 0, b = 0;
  field.out.curl.forEach((w, c) => {
    if (w > hi) { hi = w; a = c; }
    if (w < lo) { lo = w; b = c; }
  });
  const xy = c => [(c % field.nx + 0.5) * field.h, (Math.floor(c / field.nx) + 0.5) * field.h];
  return { positive: xy(a), negative: xy(b), hi, lo };
};

const sweep = (x0, x1, y, seconds) => t => t <= seconds ? [lerp(x0, x1, t / seconds), y] : null;

test('grid resolution is capped and independent of device pixel ratio', () => {
  for (const [w, h] of [[5120, 2880], [2560, 1440], [1440, 900], [390, 844]]) {
    const field = create(w, h);
    assert.ok(field.nx * field.ny <= 3200 * 1.1, `${w}x${h} -> ${field.nx}x${field.ny}`);
    assert.ok(field.h >= 14);
    assert.ok(field.nx * field.h >= w && field.ny * field.h >= h);
  }
  // CSS pixels in, so the same viewport gives the same grid at any DPR.
  const a = create(1440, 900), b = create(1440, 900);
  assert.deepEqual([a.nx, a.ny, a.h], [b.nx, b.ny, b.h]);
});

test('still water costs nothing and reports itself inactive', () => {
  const field = create(1440, 900);
  assert.equal(field.active, false);
  assert.equal(field.step(1 / 60), false);
  assert.equal(field.steps, 0);
});

test('the projection keeps the flow incompressible', () => {
  const field = create(1440, 900);
  drive(field, sweep(300, 1000, 450, 0.5), 0.8);
  const gradientScale = field.maxSpeed / field.h;
  assert.ok(field.divergence() < gradientScale * 0.01,
    `residual ${field.divergence()} vs ${gradientScale}`);
});

test('a straight sweep drags water along behind the stick, not far ahead of it', () => {
  const field = create(1440, 900);
  drive(field, sweep(300, 900, 450, 0.5), 0.5);
  let along = 0;
  for (let x = 400; x <= 850; x += 25) along += at(field, 'u', x, 450);
  assert.ok(along / 19 > 150, `mean wake velocity ${along / 19}`);
  const ahead = Math.hypot(at(field, 'u', 1300, 450), at(field, 'v', 1300, 450));
  assert.ok(ahead < field.maxSpeed * 0.1, `ahead ${ahead} of ${field.maxSpeed}`);
  const beside = Math.hypot(at(field, 'u', 600, 150), at(field, 'v', 600, 150));
  assert.ok(beside < field.maxSpeed * 0.1);
});

test('speed sets the disturbance: slow strokes stay laminar, quick sweeps shed eddies', () => {
  const run = speed => {
    const field = create(1440, 900);
    let energy = 0;
    const seconds = 600 / speed;
    drive(field, sweep(300, 900, 450, seconds), seconds + 0.25, (t, f) => {
      energy = Math.max(energy, f.energy());
    });
    // Count vorticity sign changes along each flank of the path.
    let flips = 0;
    for (const y of [450 - 1.5 * field.h, 450 + 1.5 * field.h]) {
      let sign = 0;
      for (let x = 300; x <= 880; x += field.h) {
        const w = at(field, 'curl', x, y);
        if (Math.abs(w) < 3) continue;
        if (sign && Math.sign(w) !== sign) flips++;
        sign = Math.sign(w);
      }
    }
    return { energy, flips, peak: field.maxSpeed };
  };
  const slow = run(150);
  const fast = run(1500);
  assert.ok(fast.energy > slow.energy * 50, `${fast.energy} vs ${slow.energy}`);
  assert.ok(fast.peak > slow.peak * 4);
  assert.equal(slow.flips, 0);
  assert.ok(fast.flips >= 3, `fast flips ${fast.flips}`);
});

test('after stopping, the wake keeps evolving and then becomes completely still', () => {
  const field = create(1440, 900);
  const end = drive(field, sweep(300, 900, 450, 0.5), 0.5);
  const before = cores(field);
  const snapshot = Float32Array.from(field.out.u);
  drive(field, () => null, 0.8, null, { start: end });
  const after = cores(field);
  // The stopping vortex pair carries on in the direction of travel.
  const drift = (after.positive[0] + after.negative[0]) / 2 - (before.positive[0] + before.negative[0]) / 2;
  assert.ok(drift > 40, `pair drift ${drift}px`);
  assert.ok(after.hi > 3 && after.lo < -3, 'counter-rotating eddies remain');
  assert.notDeepEqual(Float32Array.from(field.out.u), snapshot);

  let energy = field.energy();
  let seconds = 0;
  while (field.active) {
    field.step(1 / 60);
    seconds += 1 / 60;
    const next = field.energy();
    assert.ok(next <= energy * 1.0001, 'unforced water never gains energy');
    energy = next;
    assert.ok(seconds < 6, 'settles within six seconds');
  }
  assert.equal(field.energy(), 0);
  assert.equal(field.maxSpeed, 0);
  assert.ok(field.out.u.every(value => value === 0));
  assert.ok(field.out.curl.every(value => value === 0));
  assert.equal(field.step(1 / 60), false);
});

test('eddies roll up and drift rather than staying where they were made', () => {
  const field = create(1440, 900);
  let t = drive(field, sweep(250, 1100, 450, 0.55), 0.55);
  const track = [];
  t = drive(field, () => null, 1.2, (time, f) => {
    if (Math.round(time * 60) % 12 === 0) track.push(cores(f));
  }, { start: t });
  assert.ok(track.length >= 5);
  const moved = Math.hypot(
    track.at(-1).negative[0] - track[0].negative[0],
    track.at(-1).negative[1] - track[0].negative[1]);
  assert.ok(moved > field.h * 2, `core moved ${moved}px`);
  assert.ok(track.every(c => c.hi > 0 && c.lo < 0));
});

test('a loop sets the enclosed water turning with the stroke', () => {
  const loop = direction => {
    const field = create(1440, 900);
    drive(field, t => t <= 1 ? [720 + 160 * Math.cos(direction * t * 2 * Math.PI),
      450 + 160 * Math.sin(direction * t * 2 * Math.PI)] : null, 1.1);
    return field.circulation(560, 290, 880, 610);
  };
  const clockwise = loop(1);   // screen y points down
  const anticlockwise = loop(-1);
  assert.ok(Math.abs(clockwise) > 1e4, `circulation ${clockwise}`);
  assert.ok(Math.sign(clockwise) === -Math.sign(anticlockwise));
});

test('an abrupt reversal pulls the existing wake back the other way', () => {
  const field = create(1440, 900);
  let t = drive(field, sweep(350, 950, 450, 0.4), 0.4);
  let rightward = 0;
  for (let x = 600; x <= 900; x += 20) rightward += at(field, 'u', x, 450);
  assert.ok(rightward > 0);
  t = drive(field, s => s <= 0.8 ? [lerp(950, 450, (s - 0.4) / 0.4), 450] : null, 0.4, null, { start: t });
  let after = 0;
  for (let x = 600; x <= 900; x += 20) after += at(field, 'u', x, 450);
  assert.ok(after < 0, `older flow overturned: ${after}`);
  assert.ok(finite(field));
});

test('crossing an existing wake changes the older flow, not just the new path', () => {
  const horizontal = sweep(250, 1100, 450, 0.5);
  const run = cross => {
    const field = create(1440, 900);
    drive(field, t => {
      if (t <= 0.5) return horizontal(t);
      if (cross && t >= 0.8 && t <= 1.25) return [640, lerp(120, 780, (t - 0.8) / 0.45)];
      return null;
    }, 1.8);
    return field;
  };
  const alone = run(false);
  const crossed = run(true);
  // Compare the old wake well away from the crossing stroke's own column.
  let diff = 0, norm = 0;
  for (let x = 260; x <= 1100; x += alone.h) {
    if (Math.abs(x - 640) < 120) continue;
    for (let y = 400; y <= 500; y += alone.h) {
      const du = at(crossed, 'u', x, y) - at(alone, 'u', x, y);
      const dv = at(crossed, 'v', x, y) - at(alone, 'v', x, y);
      diff += du * du + dv * dv;
      norm += at(alone, 'u', x, y) ** 2 + at(alone, 'v', x, y) ** 2;
    }
  }
  assert.ok(Math.sqrt(diff / norm) > 0.2, `relative change ${Math.sqrt(diff / norm)}`);
});

test('violent input, sharp turns and long frame gaps stay finite and bounded', () => {
  const field = create(1440, 900);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    for (let s = 0; s < 6; s++) {
      field.stir(rnd() * 1600 - 80, rnd() * 1000 - 50, rnd() * 1600 - 80, rnd() * 1000 - 50,
        rnd() * 0.01);
    }
    field.stir(NaN, 0, 1, 1, 0.01);
    field.stir(0, 0, Infinity, 1, 0.01);
    field.stir(0, 0, 10, 10, 0);
    field.stir(0, 0, 10, 10, -1);
    field.step(k % 50 === 0 ? 3 : k % 7 === 0 ? 1e-5 : 1 / 60);
    worst = Math.max(worst, field.maxSpeed);
    assert.ok(finite(field), `non-finite at step ${k}`);
  }
  assert.ok(worst < field.options.maxSpeed * 2, `peak ${worst}`);
  let seconds = 0;
  while (field.step(1 / 60)) seconds += 1 / 60;
  assert.ok(seconds < 8);
  assert.equal(field.energy(), 0);
});

test('weak motion is never amplified into swirls', () => {
  const field = create(1440, 900);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) {
    const x = rnd() * 1400, y = rnd() * 860;
    field.stir(x, y, x + rnd() * 2, y + rnd() * 2, 0.05); // ~40 px/s jitter
  }
  field.step(1 / 60);
  let energy = field.energy();
  while (field.step(1 / 60)) {
    const next = field.energy();
    assert.ok(next <= energy * 1.0001);
    energy = next;
  }
});

test('scrolling carries the water with the page; large jumps clear it', () => {
  const field = create(1440, 900);
  drive(field, sweep(300, 900, 450, 0.4), 0.4);
  const before = at(field, 'u', 700, 450);
  field.translate(0, 100);
  field.step(1 / 60);
  const moved = at(field, 'u', 700, 350);
  assert.ok(Math.abs(moved - before) < Math.abs(before) * 0.35, `${before} -> ${moved}`);
  field.translate(0, 900);
  assert.equal(field.active, false);
  assert.equal(field.energy(), 0);
});

test('queued obstacle work per step is bounded', () => {
  // Slow segments (no shedding) so only the retained segments matter.
  const flood = create(1440, 900);
  const tail = create(1440, 900);
  const segment = k => [100 + k, 450, 101 + k, 450, 0.01];
  for (let k = 0; k < 1000; k++) flood.stir(...segment(k));
  for (let k = 1000 - 48; k < 1000; k++) tail.stir(...segment(k));
  flood.step(1 / 60);
  tail.step(1 / 60);
  assert.deepEqual(Array.from(flood.out.u), Array.from(tail.out.u));
});
