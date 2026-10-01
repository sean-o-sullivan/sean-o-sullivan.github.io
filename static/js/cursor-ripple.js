// Shared fluid wake for the homepage and portfolio pages.
//
// The mouse is a moving obstacle in a low-resolution incompressible flow
// (fluid-field.js). The flow is shown in two independent layers:
//
// 1. The page beneath. Chromium can run an SVG filter as a backdrop-filter,
//    so the real rendered page is displaced by a map built from the field
//    (feFlood blocks -> feGaussianBlur -> feDisplacementMap). No capture,
//    no readback and no bitmap encoding: the map is a few hundred filter
//    attributes. Safari ignores SVG backdrop filters and Firefox parses but
//    does not draw them, so those browsers get a backdrop blur clipped to
//    contours of the same field instead.
// 2. Surface light. A WebGL2 canvas draws small specular glints wherever the
//    slope of a surface height (taken from the solver's pressure: dimples in
//    eddy cores, a bump ahead of the stick) would mirror a light into view.
//    Without WebGL2 this layer is simply absent.
//
// Everything is pointer-transparent and aria-hidden. The loop stops as soon
// as the water is still.
(() => {
  'use strict';

  const Field = globalThis.FluidField;
  if (!Field || typeof matchMedia !== 'function' || typeof document === 'undefined') return;

  const NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const supports = (property, value) => {
    try { return CSS.supports(property, value); } catch (error) { return false; }
  };
  const backdrop = supports('backdrop-filter', 'blur(1px)') ||
    supports('-webkit-backdrop-filter', 'blur(1px)');
  const brands = (typeof navigator !== 'undefined' && navigator.userAgentData &&
    navigator.userAgentData.brands) || [];
  // Firefox reports url() as supported in backdrop-filter but renders
  // nothing, so feature detection alone cannot be trusted here.
  const refracts = backdrop && brands.some(b => b.brand === 'Chromium') &&
    supports('backdrop-filter', 'url(#a)');
  const clips = backdrop && !refracts && supports('clip-path', 'path("M0 0L1 0L1 1Z")');

  const LIFTED = 'a, button, input, select, textarea, label, summary, video, audio, iframe, ' +
    '[contenteditable], .image-lightbox';
  const STROKE_GAP = 110;       // ms without movement lifts the stick
  const MAX_POINTS = 64;        // pointer samples consumed per frame
  const MAX_FLOODS = 420;       // displacement blocks per frame
  const DISPLACE_MAX = 7;       // px
  const FLOW_DRAG = 0.075;      // content offset (px) per (px/s)^0.6 of current
  const SLOPE_GAIN = 0.00009;   // px offset per unit pressure gradient
  const HEIGHT_RADIUS = 3;      // cells; ~3.5 cell Gaussian high-pass of pressure
  const SURFACE_LIFT = 0.00004; // px of surface height per unit pressure
  const SURFACE_RESPONSE = 0.08; // s; smooth pressure pulses between pointer events
  const FLOW_RESPONSE = 0.045;   // s; keep slow, pixel-quantised movement continuous

  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

  let enabled = false;
  let field = null;
  let size = { w: 0, h: 0 };
  let raf = 0;
  let lastNow = 0;
  let scroll = { x: 0, y: 0 };
  let last = null;              // last pointer sample in the current stroke
  const pending = [];
  let layers = null;            // created on first stroke

  const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const viewport = () => ({
    w: Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1),
    h: Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1)
  });

  // Surface height and page offsets on the solver grid, shared by layers.
  //
  // Height follows the solver's pressure (low in eddy cores, raised ahead of
  // the stick). A closed incompressible tank answers every push instantly
  // with a domain-wide pressure tilt; a real free surface would not, so the
  // large-scale part is removed and only local structure is kept.
  let surface = null;
  const boxRows = (src, dst, nx, ny, r) => {
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      let sum = 0, n = 0;
      for (let i = 0; i <= r && i < nx; i++) { sum += src[row + i]; n++; }
      for (let i = 0; i < nx; i++) {
        dst[row + i] = sum / n;
        const add = i + r + 1, drop = i - r;
        if (add < nx) { sum += src[row + add]; n++; }
        if (drop >= 0) { sum -= src[row + drop]; n--; }
      }
    }
  };
  const boxCols = (src, dst, nx, ny, r) => {
    for (let i = 0; i < nx; i++) {
      let sum = 0, n = 0;
      for (let j = 0; j <= r && j < ny; j++) { sum += src[j * nx + i]; n++; }
      for (let j = 0; j < ny; j++) {
        dst[j * nx + i] = sum / n;
        const add = j + r + 1, drop = j - r;
        if (add < ny) { sum += src[add * nx + i]; n++; }
        if (drop >= 0) { sum -= src[drop * nx + i]; n--; }
      }
    }
  };
  const shape = (f, dt) => {
    const { nx, ny, h, out } = f;
    const cells = nx * ny;
    if (!surface || surface.height.length !== cells) {
      surface = {
        height: new Float32Array(cells),
        work: new Float32Array(cells),
        scratch: new Float32Array(cells),
        offset: new Float32Array(cells * 3)
      };
    }
    const { height, work, scratch, offset } = surface;
    const elapsed = clamp(dt, 1 / 240, 1 / 30);
    const heightBlend = 1 - Math.exp(-elapsed / SURFACE_RESPONSE);
    const flowBlend = 1 - Math.exp(-elapsed / FLOW_RESPONSE);
    const p = out.pressure, u = out.u, v = out.v, curl = out.curl;
    // Three box passes each way approximate a Gaussian low-pass; a single
    // box would leave square artefacts around sharp features.
    work.set(p);
    for (let pass = 0; pass < 3; pass++) {
      boxRows(work, scratch, nx, ny, HEIGHT_RADIUS);
      boxCols(scratch, work, nx, ny, HEIGHT_RADIUS);
    }
    // Projection pressure is an instantaneous constraint, not surface height.
    // Let the visible surface respond over time instead of flashing on every
    // newly arrived pointer sample (especially slow integer-pixel movement).
    for (let c = 0; c < cells; c++) height[c] += heightBlend * (p[c] - work[c] - height[c]);
    const inv = 0.5 / h;
    for (let j = 0; j < ny; j++) {
      const jm = j > 0 ? j - 1 : 0, jp = j < ny - 1 ? j + 1 : ny - 1;
      for (let i = 0; i < nx; i++) {
        const im = i > 0 ? i - 1 : 0, ip = i < nx - 1 ? i + 1 : nx - 1;
        const c = j * nx + i;
        // Refraction through the surface slope, plus a drag term so the page
        // appears carried a little by the current.
        const gx = (height[j * nx + ip] - height[j * nx + im]) * inv;
        const gy = (height[jp * nx + i] - height[jm * nx + i]) * inv;
        // Sub-linear in speed so a slow stroke is still visible and a fast
        // sweep does not tear the text apart.
        const speed = Math.sqrt(u[c] * u[c] + v[c] * v[c]);
        // Below ~10 px/s the water is treated as still (no far-field drift).
        const drag = speed > 1e-3 ?
          FLOW_DRAG * Math.pow(speed, 0.6) / speed * smooth((speed - 6) / 30) : 0;
        let dx = drag * u[c] + SLOPE_GAIN * gx;
        let dy = drag * v[c] + SLOPE_GAIN * gy;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m > 1e-6) {
          const k = DISPLACE_MAX * Math.tanh(m / DISPLACE_MAX) / m;
          dx *= k; dy *= k;
        }
        // Fade at the viewport edge so nothing is sampled from outside it.
        const edge = smooth(Math.min(i + 0.5, nx - i - 0.5, j + 0.5, ny - j - 0.5) / 2);
        offset[c * 3] += flowBlend * (dx * edge - offset[c * 3]);
        offset[c * 3 + 1] += flowBlend * (dy * edge - offset[c * 3 + 1]);
        // Softening hides whole-pixel steps in the displaced image and adds
        // a little turbidity where the water is rotating.
        const soft = Math.max(smooth(m / 0.9), smooth((Math.abs(curl[c]) - 4) / 26)) * edge;
        offset[c * 3 + 2] += flowBlend * (soft - offset[c * 3 + 2]);
      }
    }
    return surface;
  };

  // --- Layer 1a: SVG displacement of the page (Chromium) -------------------
  const createRefraction = () => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cursor-wake__defs');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'cursor-wake-refraction');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const el = (name, attrs, parent = filter) => {
      const node = document.createElementNS(NS, name);
      for (const key in attrs) node.setAttribute(key, attrs[key]);
      parent.append(node);
      return node;
    };
    el('feFlood', { 'flood-color': 'rgb(128,128,0)', result: 'still' });
    const floods = [];
    const firstNode = document.createElementNS(NS, 'feMergeNode');
    firstNode.setAttribute('in', 'still');
    const merge = document.createElementNS(NS, 'feMerge');
    merge.setAttribute('result', 'blocks');
    merge.append(firstNode);
    // Blocks are inserted before the merge as the pool grows.
    filter.append(merge);
    const smoothMap = el('feGaussianBlur', { in: 'blocks', stdDeviation: '20', result: 'map' });
    el('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'map', scale: String(DISPLACE_MAX * 2),
      xChannelSelector: 'R', yChannelSelector: 'G', result: 'moved'
    });
    el('feGaussianBlur', { in: 'moved', stdDeviation: '0.55', result: 'soft' });
    el('feColorMatrix', {
      in: 'map', type: 'matrix', result: 'agitation',
      values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0.75 0 0'
    });
    el('feComposite', { in: 'soft', in2: 'agitation', operator: 'in', result: 'softened' });
    const out = el('feMerge', {});
    el('feMergeNode', { in: 'moved' }, out);
    el('feMergeNode', { in: 'softened' }, out);
    svg.append(filter);

    const surface = document.createElement('div');
    surface.className = 'cursor-wake';
    surface.setAttribute('aria-hidden', 'true');
    surface.hidden = true;
    surface.style.backdropFilter = 'url(#cursor-wake-refraction)';

    const grow = count => {
      while (floods.length < count) {
        const k = floods.length;
        const node = document.createElementNS(NS, 'feFlood');
        node.setAttribute('result', `b${k}`);
        node.setAttribute('x', '-64');
        node.setAttribute('y', '-64');
        node.setAttribute('width', '1');
        node.setAttribute('height', '1');
        node.setAttribute('flood-color', 'rgb(128,128,0)');
        filter.insertBefore(node, merge);
        const mergeNode = document.createElementNS(NS, 'feMergeNode');
        mergeNode.setAttribute('in', `b${k}`);
        merge.append(mergeNode);
        floods.push({ node, key: '', colour: '' });
      }
    };

    const blocks = [];
    let region = '';

    return {
      nodes: [svg, surface],
      draw(f, water) {
        const { nx, ny, h } = f;
        const { w: vw, h: vh } = size;
        const key = `${vw}x${vh}`;
        if (key !== region) {
          region = key;
          filter.setAttribute('x', '0');
          filter.setAttribute('y', '0');
          filter.setAttribute('width', String(vw));
          filter.setAttribute('height', String(vh));
          smoothMap.setAttribute('stdDeviation', (h * 0.9).toFixed(1));
        }
        const d = water.offset;
        const bx = Math.ceil(nx / 2), by = Math.ceil(ny / 2);
        const scale = 127 / DISPLACE_MAX;
        blocks.length = 0;
        for (let j = 0; j < by; j++) {
          for (let i = 0; i < bx; i++) {
            let sx = 0, sy = 0, sb = 0, n = 0;
            for (let dj = 0; dj < 2; dj++) {
              const cj = 2 * j + dj;
              if (cj >= ny) continue;
              for (let di = 0; di < 2; di++) {
                const ci = 2 * i + di;
                if (ci >= nx) continue;
                const c = (cj * nx + ci) * 3;
                sx += d[c]; sy += d[c + 1]; sb += d[c + 2]; n++;
              }
            }
            const r = Math.round(clamp(128 + sx / n * scale, 0, 255));
            const g = Math.round(clamp(128 + sy / n * scale, 0, 255));
            const b = Math.round(clamp(sb / n * 255, 0, 255));
            if (Math.abs(r - 128) < 3 && Math.abs(g - 128) < 3 && b < 8) continue;
            blocks.push([i, j, r, g, b, Math.abs(r - 128) + Math.abs(g - 128) + b * 0.25]);
          }
        }
        if (blocks.length > MAX_FLOODS) {
          blocks.sort((a, b) => b[5] - a[5]);
          blocks.length = MAX_FLOODS;
        }
        grow(Math.min(MAX_FLOODS, Math.ceil(blocks.length / 32) * 32));
        const span = 2 * h;
        for (let k = 0; k < floods.length; k++) {
          const slot = floods[k];
          let keyNext, colour;
          if (k < blocks.length) {
            const [i, j, r, g, b] = blocks[k];
            keyNext = `${i},${j}`;
            colour = `rgb(${r},${g},${b})`;
            if (slot.key !== keyNext) {
              slot.node.setAttribute('x', (i * span).toFixed(1));
              slot.node.setAttribute('y', (j * span).toFixed(1));
              slot.node.setAttribute('width', span.toFixed(1));
              slot.node.setAttribute('height', span.toFixed(1));
            }
          } else {
            keyNext = 'off';
            colour = 'rgb(128,128,0)';
            if (slot.key !== keyNext) {
              slot.node.setAttribute('x', '-64');
              slot.node.setAttribute('y', '-64');
              slot.node.setAttribute('width', '1');
              slot.node.setAttribute('height', '1');
            }
          }
          slot.key = keyNext;
          if (slot.colour !== colour) {
            slot.colour = colour;
            slot.node.setAttribute('flood-color', colour);
          }
        }
        surface.hidden = blocks.length === 0;
      },
      hide() {
        surface.hidden = true;
      }
    };
  };

  // --- Layer 1b: blur clipped to field contours (Safari, Firefox) ----------
  const createContourBlur = () => {
    const levels = [0.2, 0.5];
    const surfaces = levels.map((_, k) => {
      const node = document.createElement('div');
      node.className = 'cursor-wake cursor-wake--soft';
      node.setAttribute('aria-hidden', 'true');
      node.hidden = true;
      const blur = `blur(${(0.6 + k * 0.35).toFixed(2)}px)`;
      node.style.webkitBackdropFilter = blur;
      node.style.backdropFilter = blur;
      return node;
    });
    let weights = null;
    const MAX_VERTICES = 900;

    // Marching squares on cell centres; segments are linked into loops and
    // written with quadratic smoothing through edge midpoints.
    const contour = (f, level) => {
      const { nx, ny, h } = f;
      const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny) ? 0 : weights[j * nx + i];
      const edges = new Map();
      const pt = (i, j, dir) => {
        // dir 0: horizontal edge (i,j)-(i+1,j); 1: vertical edge (i,j)-(i,j+1)
        const a = at(i, j), b = dir ? at(i, j + 1) : at(i + 1, j);
        const t = clamp((level - a) / ((b - a) || 1e-6), 0, 1);
        const x = (i + 0.5 + (dir ? 0 : t)) * h, y = (j + 0.5 + (dir ? t : 0)) * h;
        return [x, y];
      };
      const segs = [];
      for (let j = -1; j < ny; j++) {
        for (let i = -1; i < nx; i++) {
          const c = (at(i, j) > level ? 8 : 0) | (at(i + 1, j) > level ? 4 : 0) |
            (at(i + 1, j + 1) > level ? 2 : 0) | (at(i, j + 1) > level ? 1 : 0);
          if (c === 0 || c === 15) continue;
          const top = `${i},${j},0`, right = `${i + 1},${j},1`, bottom = `${i},${j + 1},0`,
            left = `${i},${j},1`;
          const add = (a, b) => segs.push([a, b]);
          switch (c) {
            case 1: add(left, bottom); break;
            case 2: add(bottom, right); break;
            case 3: add(left, right); break;
            case 4: add(right, top); break;
            case 5: add(left, top); add(right, bottom); break;
            case 6: add(bottom, top); break;
            case 7: add(left, top); break;
            case 8: add(top, left); break;
            case 9: add(top, bottom); break;
            case 10: add(top, right); add(bottom, left); break;
            case 11: add(top, right); break;
            case 12: add(right, left); break;
            case 13: add(right, bottom); break;
            case 14: add(bottom, left); break;
          }
        }
      }
      for (const s of segs) edges.set(s[0], s[1]);
      const coords = key => {
        const [i, j, dir] = key.split(',').map(Number);
        return pt(i, j, dir);
      };
      let path = '';
      let vertices = 0;
      for (const start of [...edges.keys()]) {
        if (!edges.has(start)) continue;
        const loop = [];
        let key = start;
        while (edges.has(key) && loop.length < 4000) {
          loop.push(coords(key));
          const next = edges.get(key);
          edges.delete(key);
          key = next;
        }
        if (loop.length < 3) continue;
        vertices += loop.length;
        if (vertices > MAX_VERTICES) break;
        const f2 = n => n.toFixed(1);
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let m = mid(loop[loop.length - 1], loop[0]);
        path += `M${f2(m[0])} ${f2(m[1])}`;
        for (let k = 0; k < loop.length; k++) {
          const a = loop[k], b = loop[(k + 1) % loop.length];
          m = mid(a, b);
          path += `Q${f2(a[0])} ${f2(a[1])} ${f2(m[0])} ${f2(m[1])}`;
        }
        path += 'Z';
      }
      return path;
    };

    return {
      nodes: surfaces,
      draw(f, water) {
        const d = water.offset;
        const cells = f.nx * f.ny;
        if (!weights || weights.length !== cells) weights = new Float32Array(cells);
        for (let c = 0; c < cells; c++) {
          const m = Math.sqrt(d[c * 3] * d[c * 3] + d[c * 3 + 1] * d[c * 3 + 1]) / DISPLACE_MAX;
          weights[c] = Math.max(m, d[c * 3 + 2] * 0.6);
        }
        levels.forEach((level, k) => {
          const path = contour(f, level);
          const node = surfaces[k];
          node.hidden = !path;
          if (path) node.style.clipPath = `path('${path}')`;
        });
      },
      hide() { surfaces.forEach(node => { node.hidden = true; }); }
    };
  };

  // --- Layer 2: surface light (WebGL2) -------------------------------------
  const VERTEX = `#version 300 es
in vec2 corner;
out vec2 vPos;
void main() {
  vPos = corner * 0.5 + 0.5;
  gl_Position = vec4(corner, 0.0, 1.0);
}`;
  const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D field;  // surface height (px)
uniform vec2 grid;        // cells
uniform vec2 extent;      // grid size in CSS px
uniform vec2 view;        // canvas size in CSS px
uniform vec3 glint;       // slope that reflects the light into view, width
uniform vec2 gain;        // highlight, shadow alpha
in vec2 vPos;
out vec4 colour;

// Cubic B-spline reconstruction from four bilinear taps.
float spline(vec2 p) {
  vec2 t = p - 0.5;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / grid;
  vec2 h1 = (i + 1.5 + w3 / g1) / grid;
  return g0.y * (g0.x * texture(field, h0).r + g1.x * texture(field, vec2(h1.x, h0.y)).r) +
         g1.y * (g0.x * texture(field, vec2(h0.x, h1.y)).r + g1.x * texture(field, h1).r);
}

void main() {
  vec2 px = vec2(vPos.x, 1.0 - vPos.y) * view;
  vec2 p = px / extent * grid;
  float e = 0.5;
  float hx = spline(p + vec2(e, 0.0)) - spline(p - vec2(e, 0.0));
  float hy = spline(p + vec2(0.0, e)) - spline(p - vec2(0.0, e));
  // Surface slope (height in px over distance in px).
  vec2 slope = vec2(hx, hy) / (2.0 * e * extent.x / grid.x);
  // Specular reflection of a small, high light: only where the slope is
  // close to the one that mirrors it into view. Flat water shows nothing.
  vec2 d = slope - glint.xy;
  float spark = exp(-dot(d, d) / (glint.z * glint.z));
  vec2 a = slope + glint.xy;
  float shadow = exp(-dot(a, a) / (glint.z * glint.z));
  float g = gain.x * spark;
  float s = gain.y * shadow;
  colour = vec4(vec3(g), g + s);
}`;

  const createLight = () => {
    const canvas = document.createElement('canvas');
    canvas.className = 'cursor-wake-light';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
        stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power'
      });
    } catch (error) {
      gl = null;
    }
    if (!gl) return null;

    let program, texture, buffer, uniforms, data, texSize = '';
    let lost = false;

    const compile = () => {
      const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.bindAttribLocation(program, 0, 'corner');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      uniforms = {};
      for (const name of ['field', 'grid', 'extent', 'view', 'glint', 'gain']) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      texSize = '';
    };

    try { compile(); } catch (error) { return null; }

    const light = {
      nodes: [canvas],
      draw(f, water) {
        if (lost || gl.isContextLost()) { canvas.hidden = true; return; }
        const { nx, ny, h } = f;
        const scale = Math.min(globalThis.devicePixelRatio || 1, 1.5);
        const cw = Math.max(1, Math.round(size.w * scale));
        const ch = Math.max(1, Math.round(size.h * scale));
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        const cells = nx * ny;
        if (!data || data.length !== cells) data = new Float32Array(cells);
        // Surface height in px, so half-float storage cannot overflow.
        for (let c = 0; c < cells; c++) data[c] = water.height[c] * SURFACE_LIFT;
        gl.viewport(0, 0, cw, ch);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const key = `${nx}x${ny}`;
        if (texSize !== key) {
          texSize = key;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, nx, ny, 0, gl.RED, gl.FLOAT, data);
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RED, gl.FLOAT, data);
        }
        gl.uniform1i(uniforms.field, 0);
        gl.uniform2f(uniforms.grid, nx, ny);
        gl.uniform2f(uniforms.extent, nx * h, ny * h);
        gl.uniform2f(uniforms.view, size.w, size.h);
        gl.uniform3f(uniforms.glint, 0.05, 0.07, 0.02);
        if (theme() === 'dark') gl.uniform2f(uniforms.gain, 0.3, 0);
        else gl.uniform2f(uniforms.gain, 0.3, 0.045);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.hidden = false;
      },
      hide() {
        canvas.hidden = true;
      }
    };

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      lost = true;
      canvas.hidden = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { compile(); lost = false; } catch (error) { lost = true; }
    });
    return light;
  };

  const ensureLayers = () => {
    if (layers) return layers;
    const content = refracts ? createRefraction() : clips ? createContourBlur() : null;
    const light = createLight();
    layers = { content, light };
    for (const layer of [content, light]) {
      if (layer) layer.nodes.forEach(node => document.body.append(node));
    }
    return layers;
  };

  const hideLayers = () => {
    if (!layers) return;
    if (layers.content) layers.content.hide();
    if (layers.light) layers.light.hide();
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastNow = 0;
  };

  // Still water: no field, no loop, nothing drawn.
  const reset = () => {
    stop();
    pending.length = 0;
    last = null;
    surface = null;
    if (field) field.clear();
    hideLayers();
  };

  const endStroke = () => { last = null; };

  const frame = now => {
    raf = 0;
    if (!enabled || document.hidden || !field) { reset(); return; }
    const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    const sx = globalThis.scrollX || 0, sy = globalThis.scrollY || 0;
    field.translate(sx - scroll.x, sy - scroll.y);
    if (sx !== scroll.x || sy !== scroll.y) surface = null;
    scroll = { x: sx, y: sy };
    for (const s of pending) field.stir(s[0], s[1], s[2], s[3], s[4]);
    pending.length = 0;
    const moving = field.step(dt);
    if (moving) {
      const { content, light } = ensureLayers();
      const water = shape(field, dt);
      if (content) content.draw(field, water);
      if (light) light.draw(field, water);
      raf = requestAnimationFrame(frame);
    } else {
      hideLayers();
      surface = null;
      lastNow = 0;
    }
  };

  const wake = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // Measured when enabled and after each resize, never per pointer event.
  let measured = null;
  const ensureField = () => {
    const next = measured || (measured = viewport());
    if (!field || next.w !== size.w || next.h !== size.h) {
      size = next;
      field = Field.create(size.w, size.h);
      scroll = { x: globalThis.scrollX || 0, y: globalThis.scrollY || 0 };
    }
    return field;
  };

  const move = event => {
    if (event.pointerType !== 'mouse' || document.hidden) return;
    const target = event.target;
    if (event.buttons !== 0 || (target && target.closest && target.closest(LIFTED))) {
      endStroke();
      return;
    }
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const points = samples.length ? samples : [event];
    ensureField();
    for (let k = Math.max(0, points.length - MAX_POINTS); k < points.length; k++) {
      const e = points[k];
      const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.t)) continue;
      if (!last || p.t - last.t > STROKE_GAP || p.t < last.t) {
        if (!last || p.t - last.t > STROKE_GAP) field.lift();
        last = p;
        continue;
      }
      const dx = p.x - last.x, dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.25 || p.t === last.t) continue;
      if (pending.length >= MAX_POINTS) pending.shift();
      pending.push([last.x, last.y, p.x, p.y, (p.t - last.t) / 1000]);
      last = p;
    }
    if (pending.length) wake();
  };

  const onResize = () => {
    reset();
    field = null;
    measured = null;
  };

  const onVisibility = () => {
    if (document.hidden) reset();
  };

  const sync = () => {
    const next = !reducedMotion.matches && finePointer.matches && (backdrop || !!globalThis.WebGL2RenderingContext);
    if (next === enabled) return;
    enabled = next;
    if (enabled) {
      window.addEventListener('pointermove', move, { passive: true });
    } else {
      window.removeEventListener('pointermove', move);
      reset();
    }
  };

  const listen = (target, type, handler) => {
    if (target.addEventListener) target.addEventListener(type, handler);
    else if (target.addListener) target.addListener(handler);
  };
  listen(reducedMotion, 'change', sync);
  listen(finePointer, 'change', sync);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', endStroke);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', onVisibility);
  document.documentElement.addEventListener('pointerleave', endStroke);
  sync();
})();
