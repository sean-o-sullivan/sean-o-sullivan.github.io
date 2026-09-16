// Inline previews paint without image requests. Upgrade nearby images first,
// but keep draining the whole page in the background, even without scrolling.
(() => {
  const start = () => {
    const items = [...document.querySelectorAll('img[data-image-variants]')].map(img => ({
      img, variants: JSON.parse(img.dataset.imageVariants), loaded: 0, busy: false, failed: false
    }));
    let active = 0;
    let scheduled = false;
    const measure = item => {
      const rect = item.img.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      const distance = visible ? Math.max(0, rect.top - innerHeight, -rect.bottom) : Infinity;
      const target = Math.max(1, rect.width || 400) * Math.min(devicePixelRatio || 1, 2);
      const variant = item.variants.find(v => v.width >= target) || item.variants.at(-1);
      return { item, distance, variant };
    };
    const pump = () => {
      scheduled = false;
      const queue = items.filter(i => !i.busy && !i.failed && i.img.dataset.imageVariants).map(measure)
        .filter(({ item, distance, variant }) => Number.isFinite(distance) && item.loaded < variant.width)
        .sort((a, b) => a.distance - b.distance);
      while (active < 2 && queue.length) {
        const { item, distance, variant } = queue.shift();
        item.busy = true;
        active++;
        const next = new Image();
        next.decoding = 'async';
        next.fetchPriority = distance < innerHeight ? 'high' : 'low';
        const done = () => { item.busy = false; active--; pump(); };
        next.onload = async () => {
          try { await next.decode(); } catch (_) { /* Loaded image still usable. */ }
          if (!item.img.dataset.imageVariants) { done(); return; }
          // Keep natural-ratio layouts exact; retain intentional CSS crops.
          if (getComputedStyle(item.img).aspectRatio.startsWith('auto')) {
            item.img.style.aspectRatio = item.img.dataset.imageRatio || `${item.img.naturalWidth} / ${item.img.naturalHeight}`;
          }
          item.img.src = variant.src;
          item.loaded = variant.width;
          item.img.dataset.imageLoaded = String(variant.width);
          done();
        };
        next.onerror = () => { item.failed = true; done(); }; // Keep usable preview.
        next.src = variant.src;
      }
    };
    const schedule = () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(pump); }
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    document.addEventListener('toggle', schedule, true);
    document.addEventListener('portfolio-fullscreen-restored', schedule);
    // Other page scripts may move galleries or reveal theme-specific images.
    new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    pump();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
