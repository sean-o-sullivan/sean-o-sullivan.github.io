(() => {
  document.querySelectorAll('video').forEach(video => {
    video.addEventListener('play', () => {
      document.querySelectorAll('video').forEach(other => {
        if (other !== video) other.pause();
      });
      window.PortfolioMusic?.pause();
    });
  });

  const source = document.querySelector('.container > .pace-story-media');
  const text = document.querySelector('.container > .text-column');
  if (!source || !text) return;

  // Capture nodes before the shared mobile script moves them into the story.
  const records = Array.from(source.children).map(node => {
    const marker = document.createComment('pace-desktop-media');
    node.before(marker);
    return { node, marker };
  });
  const continuation = document.createElement('section');
  continuation.className = 'pace-media-continuation';
  continuation.setAttribute('aria-label', 'Pace build photographs and videos, continued');
  continuation.hidden = true;
  source.after(continuation);

  const desktop = window.matchMedia('(min-width: 821px)');
  let scheduled;
  let lastLayout = '';
  const pack = () => {
    // Reparenting a fullscreen video makes the browser leave fullscreen.
    if (document.fullscreenElement || document.webkitFullscreenElement ||
        Array.from(document.querySelectorAll('video')).some(video => video.webkitDisplayingFullscreen)) return;

    if (!desktop.matches) {
      // The shared script owns inline placement and restores nodes on desktop.
      lastLayout = '';
      continuation.hidden = true;
      return;
    }

    const textRect = text.getBoundingClientRect();
    const layout = [window.innerWidth, window.innerHeight, textRect.height, source.clientWidth].join(':');
    if (layout === lastLayout) return;
    lastLayout = layout;

    records.forEach(({ node, marker }) => {
      if (node.parentElement === continuation) marker.after(node);
    });
    continuation.hidden = true;

    const bottom = text.getBoundingClientRect().bottom;
    const overflow = records.findIndex(({ node }, index) => (
      index >= 3 && node.getBoundingClientRect().bottom > bottom + 48
    ));
    if (overflow < 0) return;

    records.slice(overflow).forEach(({ node }) => continuation.append(node));
    continuation.hidden = false;
  };
  const schedule = () => {
    // Let viewport changes settle before moving media between columns.
    clearTimeout(scheduled);
    scheduled = setTimeout(() => requestAnimationFrame(pack), 150);
  };
  const initialise = () => {
    window.addEventListener('resize', schedule, { passive: true });
    desktop.addEventListener('change', () => {
      lastLayout = '';
      schedule();
    });
    document.addEventListener('fullscreenchange', schedule);
    document.addEventListener('webkitfullscreenchange', schedule);
    document.querySelectorAll('video').forEach(video => {
      video.addEventListener('webkitendfullscreen', schedule);
    });
    new ResizeObserver(schedule).observe(text);
    document.fonts?.ready.then(schedule);
    schedule();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
