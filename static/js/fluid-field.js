// Low-resolution 2D incompressible flow for the homepage wake.
//
// Staggered (MAC) grid in CSS pixels. Each step: MacCormack advection,
// moving-obstacle penalisation, gated vorticity confinement, drag and
// friction, then a pressure projection solved with warm-started red-black
// SOR. Approximate and physically motivated, not a water model.
(() => {
  'use strict';

  const { PI, abs, ceil, exp, floor, max, min, random, sin, sqrt, tanh } = Math;

  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  const DEFAULTS = {
    maxCells: 3200,       // cap independent of devicePixelRatio
    minCell: 14,          // px
    maxDt: 1 / 30,        // s; long frame gaps are clamped, never integrated whole
    dragTime: 1.15,       // s; linear (bottom) drag time constant
    friction: 40,         // px/s^2; peak speed always falls at least this fast
    confinement: 0.22,    // vorticity confinement strength
    confineFloor: 7,      // 1/s; vorticity below this is left alone
    pressureIterations: 28,
    overRelax: 1.72,
    obstacleRadius: 9,    // px at rest speed
    obstacleGrowth: 0.75, // extra radius fraction at full speed
    obstacleCoupling: 0.006, // s; penalisation relaxation time
    maxSpeed: 2600,       // px/s; obstacle speed saturates here
    strouhal: 0.2,        // shedding frequency * diameter / speed
    sheddingLift: 0.42,   // alternating sideways velocity as a fraction of speed
    sheddingOnset: 160,   // px/s; slower strokes leave a laminar wake
    restSpeed: 4          // px/s; below this everywhere the field is zeroed
  };

  function create(width, height, options = {}) {
    const o = Object.assign({}, DEFAULTS, options);
    const h = max(o.minCell, sqrt((width * height) / o.maxCells));
    const nx = max(4, ceil(width / h));
    const ny = max(4, ceil(height / h));
    const cells = nx * ny;
    const su = nx + 1;            // u row stride
    const nu = su * ny;           // u faces: x = i h, y = (j + .5) h
    const nv = nx * (ny + 1);     // v faces: x = (i + .5) h, y = j h

    let u = new Float32Array(nu), v = new Float32Array(nv);
    let uA = new Float32Array(nu), vA = new Float32Array(nv);
    const uB = new Float32Array(nu), vB = new Float32Array(nv);
    const phi = new Float32Array(cells);
    const div = new Float32Array(cells);
    const wc = new Float32Array(cells);      // cell-centred vorticity
    const fx = new Float32Array(cells), fy = new Float32Array(cells);
    // Cell-centred outputs for rendering.
    const out = {
      nx, ny, h,
      u: new Float32Array(cells),
      v: new Float32Array(cells),
      curl: new Float32Array(cells),
      pressure: new Float32Array(cells)
    };

    const MAX_SEGMENTS = 48;
    const queue = [];
    let phase = 0;
    let lastDt = 1 / 60;
    let maxSpeed = 0;
    let active = false;
    let steps = 0;
    let lastPressureResidual = 0;

    // Bilinear sample of the u component (faces at x = i h, y = (j + .5) h).
    const sampleU = (field, x, y) => {
      const gx = clamp(x / h, 0, nx);
      const gy = clamp(y / h - 0.5, 0, ny - 1);
      const i = min(nx - 1, gx | 0), j = min(ny - 2, gy | 0);
      const tx = gx - i, ty = gy - j, k = j * su + i;
      const a = field[k] + (field[k + 1] - field[k]) * tx;
      const b = field[k + su] + (field[k + su + 1] - field[k + su]) * tx;
      return a + (b - a) * ty;
    };

    // Bilinear sample of the v component (faces at x = (i + .5) h, y = j h).
    const sampleV = (field, x, y) => {
      const gx = clamp(x / h - 0.5, 0, nx - 1);
      const gy = clamp(y / h, 0, ny);
      const i = min(nx - 2, gx | 0), j = min(ny - 1, gy | 0);
      const tx = gx - i, ty = gy - j, k = j * nx + i;
      const a = field[k] + (field[k + 1] - field[k]) * tx;
      const b = field[k + nx] + (field[k + nx + 1] - field[k + nx]) * tx;
      return a + (b - a) * ty;
    };

    // Min/max of the four u (or v) samples that bilinear interpolation used,
    // so the MacCormack correction cannot create new extrema.
    const limitU = (field, x, y, value) => {
      const gx = clamp(x / h, 0, nx), gy = clamp(y / h - 0.5, 0, ny - 1);
      const i = min(nx - 1, gx | 0), j = min(ny - 2, gy | 0), k = j * su + i;
      const a = field[k], b = field[k + 1], c = field[k + su], d = field[k + su + 1];
      const lo = min(a, b, c, d), hi = max(a, b, c, d);
      return value < lo ? lo : value > hi ? hi : value;
    };
    const limitV = (field, x, y, value) => {
      const gx = clamp(x / h - 0.5, 0, nx - 1), gy = clamp(y / h, 0, ny);
      const i = min(nx - 2, gx | 0), j = min(ny - 1, gy | 0), k = j * nx + i;
      const a = field[k], b = field[k + 1], c = field[k + nx], d = field[k + nx + 1];
      const lo = min(a, b, c, d), hi = max(a, b, c, d);
      return value < lo ? lo : value > hi ? hi : value;
    };

    // Semi-Lagrangian pass with a midpoint (RK2) trace through the current
    // velocity (u, v), carrying (srcU, srcV) into (dstU, dstV). A negative dt
    // traces forwards in time, which is the MacCormack reverse step.
    const transport = (srcU, srcV, dstU, dstV, dt) => {
      const half = 0.5 * dt;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * h;
        for (let i = 0; i <= nx; i++) {
          const k = j * su + i;
          if (i === 0 || i === nx) { dstU[k] = 0; continue; }
          const x = i * h;
          const ux = u[k], vy = sampleV(v, x, y);
          const mx = x - half * ux, my = y - half * vy;
          const bx = x - dt * sampleU(u, mx, my), by = y - dt * sampleV(v, mx, my);
          dstU[k] = sampleU(srcU, bx, by);
        }
      }
      for (let j = 0; j <= ny; j++) {
        const y = j * h;
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          if (j === 0 || j === ny) { dstV[k] = 0; continue; }
          const x = (i + 0.5) * h;
          const ux = sampleU(u, x, y), vy = v[k];
          const mx = x - half * ux, my = y - half * vy;
          const bx = x - dt * sampleU(u, mx, my), by = y - dt * sampleV(v, mx, my);
          dstV[k] = sampleV(srcV, bx, by);
        }
      }
    };

    const advect = dt => {
      // Forward semi-Lagrangian estimate.
      transport(u, v, uA, vA, dt);
      // Reverse estimate from the forward result.
      transport(uA, vA, uB, vB, -dt);
      // Correct by half the round-trip error, limited to the local range.
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * h;
        for (let i = 1; i < nx; i++) {
          const k = j * su + i;
          const corrected = uA[k] + 0.5 * (u[k] - uB[k]);
          const x = i * h;
          const bx = x - dt * u[k], by = y - dt * sampleV(v, x, y);
          uB[k] = limitU(u, bx, by, corrected);
        }
      }
      for (let j = 1; j < ny; j++) {
        const y = j * h;
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const corrected = vA[k] + 0.5 * (v[k] - vB[k]);
          const x = (i + 0.5) * h;
          const bx = x - dt * sampleU(u, x, y), by = y - dt * v[k];
          vB[k] = limitV(v, bx, by, corrected);
        }
      }
      for (let j = 0; j < ny; j++) { uB[j * su] = 0; uB[j * su + nx] = 0; }
      for (let i = 0; i < nx; i++) { vB[i] = 0; vB[ny * nx + i] = 0; }
      u.set(uB);
      v.set(vB);
    };

    // A moving obstacle swept along a segment: velocity inside the soft
    // capsule relaxes towards the obstacle's own velocity. The projection
    // then forces the surrounding water around it, which is what forms the
    // wake, the shear layers and the trailing vortex pair.
    const obstacle = (ax, ay, bx, by, vx, vy, radius, dt) => {
      const edge = h * 0.9;
      const reach = radius + edge;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const rate = 1 - exp(-dt / o.obstacleCoupling);
      const x0 = min(ax, bx) - reach, x1 = max(ax, bx) + reach;
      const y0 = min(ay, by) - reach, y1 = max(ay, by) + reach;
      const weight = (x, y) => {
        let t = len2 > 1e-6 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = x - (ax + dx * t), py = y - (ay + dy * t);
        const d = sqrt(px * px + py * py) - radius;
        return 1 - smooth(d / edge);
      };
      const i0 = max(1, floor(x0 / h)), i1 = min(nx - 1, ceil(x1 / h));
      const j0 = max(0, floor(y0 / h - 0.5)), j1 = min(ny - 1, ceil(y1 / h));
      for (let j = j0; j <= j1; j++) {
        const y = (j + 0.5) * h;
        for (let i = i0; i <= i1; i++) {
          const w = weight(i * h, y);
          if (w > 0) { const k = j * su + i; u[k] += w * rate * (vx - u[k]); }
        }
      }
      const vi0 = max(0, floor(x0 / h - 0.5)), vi1 = min(nx - 1, ceil(x1 / h));
      const vj0 = max(1, floor(y0 / h)), vj1 = min(ny - 1, ceil(y1 / h));
      for (let j = vj0; j <= vj1; j++) {
        const y = j * h;
        for (let i = vi0; i <= vi1; i++) {
          const w = weight((i + 0.5) * h, y);
          if (w > 0) { const k = j * nx + i; v[k] += w * rate * (vy - v[k]); }
        }
      }
    };

    // Cell-centred velocity and vorticity.
    const centre = () => {
      const cu = out.u, cv = out.v;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          cu[c] = 0.5 * (u[j * su + i] + u[j * su + i + 1]);
          cv[c] = 0.5 * (v[c] + v[c + nx]);
        }
      }
      const inv = 0.5 / h;
      for (let j = 0; j < ny; j++) {
        const jm = j > 0 ? j - 1 : 0, jp = j < ny - 1 ? j + 1 : ny - 1;
        for (let i = 0; i < nx; i++) {
          const im = i > 0 ? i - 1 : 0, ip = i < nx - 1 ? i + 1 : nx - 1;
          wc[j * nx + i] = (cv[j * nx + ip] - cv[j * nx + im]) * inv -
            (cu[jp * nx + i] - cu[jm * nx + i]) * inv;
        }
      }
    };

    // Vorticity confinement, gated so it only sharpens rotation that the
    // flow already has; weak numerical noise is never amplified into swirls.
    const confine = dt => {
      if (o.confinement <= 0) return;
      const eps = o.confinement * h;
      const floor = o.confineFloor;
      fx.fill(0); fy.fill(0);
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const c = j * nx + i, w = wc[c], aw = abs(w);
          if (aw < floor) continue;
          const gx = (abs(wc[c + 1]) - abs(wc[c - 1])) * 0.5;
          const gy = (abs(wc[c + nx]) - abs(wc[c - nx])) * 0.5;
          const g = sqrt(gx * gx + gy * gy);
          if (g < 1e-6) continue;
          const gate = smooth((aw - floor) / floor);
          const s = eps * gate * dt / g;
          fx[c] = s * gy * w;
          fy[c] = -s * gx * w;
        }
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const c = j * nx + i;
          u[j * su + i] += 0.5 * (fx[c - 1] + fx[c]);
        }
      }
      for (let j = 1; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          v[c] += 0.5 * (fy[c - nx] + fy[c]);
        }
      }
    };

    // Linear drag everywhere, plus a uniform settling term that removes a
    // fixed amount of the peak speed each second. Scaling the whole field
    // (rather than braking slow regions first) keeps the eddies' structure
    // intact while guaranteeing the water is completely still in finite time.
    const damp = dt => {
      const settle = maxSpeed > 0 ? max(0, 1 - o.friction * dt / maxSpeed) : 1;
      const k = exp(-dt / o.dragTime) * settle;
      for (let i = 0; i < nu; i++) u[i] *= k;
      for (let i = 0; i < nv; i++) v[i] *= k;
    };

    // Pressure projection: solve lap(phi) = div(u), then u -= grad(phi).
    // Walls are free-slip; phi is warm-started from the previous step.
    const project = dt => {
      const h2 = h * h;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          div[c] = (u[j * su + i + 1] - u[j * su + i] + v[c + nx] - v[c]) / h;
        }
      }
      // Rescale the warm start in case dt changed.
      const ratio = dt / lastDt;
      if (ratio !== 1) for (let c = 0; c < cells; c++) phi[c] *= ratio;
      const w = o.overRelax;
      for (let it = 0; it < o.pressureIterations; it++) {
        for (let parity = 0; parity < 2; parity++) {
          for (let j = 0; j < ny; j++) {
            for (let i = (j + parity) & 1; i < nx; i += 2) {
              const c = j * nx + i;
              let sum = 0, n = 0;
              if (i > 0) { sum += phi[c - 1]; n++; }
              if (i < nx - 1) { sum += phi[c + 1]; n++; }
              if (j > 0) { sum += phi[c - nx]; n++; }
              if (j < ny - 1) { sum += phi[c + nx]; n++; }
              phi[c] += w * ((sum - h2 * div[c]) / n - phi[c]);
            }
          }
        }
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 1; i < nx; i++) {
          const c = j * nx + i;
          u[j * su + i] -= (phi[c] - phi[c - 1]) / h;
        }
      }
      for (let j = 1; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          v[c] -= (phi[c] - phi[c - nx]) / h;
        }
      }
      // Pressure (per unit density) for rendering; remove the free constant.
      let mean = 0;
      for (let c = 0; c < cells; c++) mean += phi[c];
      mean /= cells;
      const inv = 1 / dt;
      for (let c = 0; c < cells; c++) out.pressure[c] = (phi[c] - mean) * inv;
      lastDt = dt;
    };

    const residual = () => {
      let worst = 0;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const c = j * nx + i;
          const d = abs((u[j * su + i + 1] - u[j * su + i] + v[c + nx] - v[c]) / h);
          if (d > worst) worst = d;
        }
      }
      return worst;
    };

    const speedOf = vx => {
      const s = abs(vx);
      return o.maxSpeed * tanh(s / o.maxSpeed);
    };

    const field = {
      nx, ny, h, cells, out,
      get active() { return active; },
      get maxSpeed() { return maxSpeed; },
      get steps() { return steps; },
      get options() { return o; },

      // Queue the obstacle sweeping a path segment it travelled in `seconds`.
      // Applied inside the next step, after advection and before projection.
      //
      // The stick is thinner than a grid cell, so the alternating vortex
      // shedding behind it cannot be resolved directly. It is represented by
      // its reaction: a sideways push that alternates once per Strouhal
      // period of travel. The eddies themselves still form in the solver.
      stir(ax, ay, bx, by, seconds) {
        const dx = bx - ax, dy = by - ay;
        const dist = sqrt(dx * dx + dy * dy);
        if (!(dist > 0) || !(seconds > 0) || !Number.isFinite(dist)) return 0;
        if (queue.length >= MAX_SEGMENTS) queue.shift();
        const raw = dist / seconds;
        const speed = speedOf(raw);
        const scale = speed / raw;
        const strength = speed / o.maxSpeed;
        const radius = o.obstacleRadius * (1 + o.obstacleGrowth * sqrt(strength));
        const diameter = 2 * radius + h;
        phase += 2 * PI * o.strouhal * dist / diameter;
        const lift = o.sheddingLift * speed *
          smooth((speed - o.sheddingOnset) / (2 * o.sheddingOnset)) * sin(phase);
        const nx_ = -dy / dist, ny_ = dx / dist;
        queue.push([ax, ay, bx, by,
          dx / seconds * scale + nx_ * lift, dy / seconds * scale + ny_ * lift, radius]);
        active = true;
        return speed;
      },

      // A new stroke starts with an arbitrary shedding phase.
      lift(seed) { phase = (seed === undefined ? random() : seed) * 2 * PI; },

      step(dtIn) {
        if (!active) return false;
        const dt = clamp(dtIn || 1 / 60, 1 / 240, o.maxDt);
        advect(dt);
        for (const s of queue) obstacle(s[0], s[1], s[2], s[3], s[4], s[5], s[6], dt);
        queue.length = 0;
        centre();
        confine(dt);
        damp(dt);
        project(dt);
        centre();
        out.curl.set(wc);
        steps++;
        let peak = 0;
        const cu = out.u, cv = out.v;
        for (let c = 0; c < cells; c++) {
          const s = cu[c] * cu[c] + cv[c] * cv[c];
          if (s > peak) peak = s;
        }
        maxSpeed = sqrt(peak);
        if (!(maxSpeed >= o.restSpeed)) {
          // Includes NaN: anything non-finite resets to still water.
          field.clear();
          return false;
        }
        return true;
      },

      // Content moves beneath the viewport; carry the water with it.
      translate(dx, dy) {
        if (!active || (!dx && !dy)) return;
        if (abs(dx) > width * 0.75 || abs(dy) > height * 0.75) {
          field.clear();
          return;
        }
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i <= nx; i++) uA[j * su + i] = sampleU(u, i * h + dx, (j + 0.5) * h + dy);
        }
        for (let j = 0; j <= ny; j++) {
          for (let i = 0; i < nx; i++) vA[j * nx + i] = sampleV(v, (i + 0.5) * h + dx, j * h + dy);
        }
        for (let j = 0; j < ny; j++) { uA[j * su] = 0; uA[j * su + nx] = 0; }
        for (let i = 0; i < nx; i++) { vA[i] = 0; vA[ny * nx + i] = 0; }
        let t = u; u = uA; uA = t;
        t = v; v = vA; vA = t;
        phi.fill(0);
      },

      clear() {
        queue.length = 0;
        u.fill(0); v.fill(0); phi.fill(0);
        out.u.fill(0); out.v.fill(0); out.curl.fill(0); out.pressure.fill(0);
        maxSpeed = 0;
        active = false;
      },

      // Diagnostics for tests and measurement.
      divergence: residual,
      energy() {
        let e = 0;
        for (let k = 0; k < nu; k++) e += u[k] * u[k];
        for (let k = 0; k < nv; k++) e += v[k] * v[k];
        return 0.5 * e * h * h;
      },
      sample(x, y) { return [sampleU(u, x, y), sampleV(v, x, y)]; },
      circulation(x0, y0, x1, y1) {
        // Integral of vorticity over a rectangle (cell-centred).
        let sum = 0;
        const i0 = clamp(floor(x0 / h), 0, nx - 1), i1 = clamp(ceil(x1 / h), 0, nx - 1);
        const j0 = clamp(floor(y0 / h), 0, ny - 1), j1 = clamp(ceil(y1 / h), 0, ny - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) sum += wc[j * nx + i];
        return sum * h * h;
      }
    };
    return field;
  }

  globalThis.FluidField = { create, DEFAULTS };
})();
