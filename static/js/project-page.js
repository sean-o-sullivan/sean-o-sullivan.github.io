(() => {
  const savedViews = new WeakMap();
  let session = null;
  let pendingRestore = null;
  let recoveryTimer;
  let recoveryFrame;
  let frame;
  let viewFrame;

  const viewport = () => `${window.innerWidth}:${window.innerHeight}`;
  const snapshot = (media) => ({
    media,
    x: window.scrollX,
    y: window.scrollY,
    top: media.getBoundingClientRect().top,
    viewport: viewport()
  });
  const remember = (event) => {
    if (session?.exiting) session.cancelScroll = true;
    if (pendingRestore) pendingRestore.cancelScroll = true;
    const media = event.target.closest?.('video, iframe');
    if (media && !session) savedViews.set(media, snapshot(media));
  };
  // Capture before native controls can scroll or resize the document.
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('keydown', remember, true);

  // Native control clicks are not exposed as DOM pointer events in every browser.
  const rememberView = () => {
    cancelAnimationFrame(viewFrame);
    viewFrame = requestAnimationFrame(() => {
      if (session || (pendingRestore && !pendingRestore.cancelScroll)) return;
      document.querySelectorAll('video, iframe').forEach(media => savedViews.set(media, snapshot(media)));
    });
  };
  window.addEventListener('scroll', rememberView, { passive: true });
  window.addEventListener('resize', rememberView, { passive: true });
  document.addEventListener('DOMContentLoaded', rememberView);
  rememberView();

  const begin = (media) => {
    if (session?.media === media && !session.exiting) return;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(recoveryFrame);
    clearTimeout(recoveryTimer);
    pendingRestore = null;
    const saved = savedViews.get(media) || snapshot(media);
    session = { ...saved, exiting: false, cancelScroll: false };
  };
  const finish = () => {
    const saved = session;
    session = null;
    pendingRestore = saved;
    // Responsive placement must finish before the reading position is restored.
    document.dispatchEvent(new Event('portfolio-fullscreen-restored'));
    frame = requestAnimationFrame(() => {
      if (pendingRestore !== saved) return;
      if (session || saved.cancelScroll || !saved.media.isConnected) {
        pendingRestore = null;
        return;
      }
      saved.media.focus?.({ preventScroll: true });
      restorePosition();
      // Native focus/scroll restoration can arrive after fullscreenchange and resize.
      recoveryTimer = setTimeout(() => {
        if (pendingRestore === saved) pendingRestore = null;
        rememberView();
      }, 1500);
    });
  };
  const restorePosition = () => {
    const saved = pendingRestore;
    if (!saved || saved.cancelScroll || !saved.media.isConnected) return;
    const y = viewport() === saved.viewport
      ? saved.y
      : window.scrollY + saved.media.getBoundingClientRect().top - saved.top;
    const top = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
    if (Math.abs(window.scrollY - top) > 1 || Math.abs(window.scrollX - saved.x) > 1) {
      window.scrollTo({ left: saved.x, top, behavior: 'instant' });
    }
  };
  window.addEventListener('scroll', () => {
    if (!pendingRestore || pendingRestore.cancelScroll) return;
    cancelAnimationFrame(recoveryFrame);
    recoveryFrame = requestAnimationFrame(restorePosition);
  }, { passive: true });
  const settle = () => {
    if (!session?.exiting) return;
    const now = performance.now();
    const size = viewport();
    if (size !== session.exitViewport) {
      session.exitViewport = size;
      session.lastResize = now;
    }
    // Some browsers clear fullscreen a second before restoring the window size.
    // A changed orientation may never return to the original dimensions.
    const returned = size === session.viewport;
    if ((returned || now - session.exitStarted >= 2000) && now - session.lastResize >= 180) {
      finish();
    } else {
      frame = requestAnimationFrame(settle);
    }
  };
  const end = () => {
    if (!session || session.exiting) return;
    session.exiting = true;
    session.exitStarted = performance.now();
    session.lastResize = session.exitStarted;
    session.exitViewport = viewport();
    frame = requestAnimationFrame(settle);
  };
  const changed = () => {
    const element = document.fullscreenElement || document.webkitFullscreenElement;
    if (element) {
      const media = element.matches('video, iframe') ? element : element.querySelector('video, iframe');
      if (media) begin(media);
    } else {
      end();
    }
  };
  document.addEventListener('fullscreenchange', changed, true);
  document.addEventListener('webkitfullscreenchange', changed, true);
  document.addEventListener('webkitbeginfullscreen', event => begin(event.target), true);
  document.addEventListener('webkitendfullscreen', end, true);

  const resized = () => {
    if (session?.exiting) session.lastResize = performance.now();
  };
  window.addEventListener('resize', resized, { passive: true });
  window.visualViewport?.addEventListener('resize', resized, { passive: true });
  const cancelScroll = () => {
    if (session?.exiting) session.cancelScroll = true;
    if (pendingRestore) pendingRestore.cancelScroll = true;
  };
  window.addEventListener('wheel', cancelScroll, { passive: true });
  window.addEventListener('touchmove', cancelScroll, { passive: true });
  window.addEventListener('hashchange', cancelScroll);
  window.addEventListener('popstate', cancelScroll);
  document.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelScroll();
  });
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(viewFrame);
    cancelAnimationFrame(recoveryFrame);
    clearTimeout(recoveryTimer);
    session = null;
    pendingRestore = null;
  });
  window.PortfolioFullscreen = { isTransitioning: () => Boolean(session) };
})();

(() => {
  const mobileHeroes = {
    '/projects/mu/': ['/thumbnails/mu.jpeg', 'Wrapped Mu particle detector board'],
    '/projects/ogma/': ['/thumbnails/ogma.jpeg', 'Render of the Ogma modular flight computer stack'],
    '/projects/pace/': ['/thumbnails/pace.jpeg', 'Working Pace timer held in one hand'],
    '/projects/vm/': ['/thumbnails/clouds3.jpeg', 'Style embedding visualisation'],
    '/projects/force/': ['/thumbnails/forceT.jpg', 'Force impact sensor'],
    '/projects/cat/': ['/thumbnails/cov.png', 'Cat RFID feeder'],
    '/projects/clock/': ['/thumbnails/clock.jpg', 'Mechanical seven-segment clock'],
    '/projects/spudnik/': ['/thumbnails/sudSpud.jpeg', 'Spudnik CanSat'],
    '/projects/wind/': ['/thumbnails/wind2.jpeg', 'Wind turbine test setup'],
    '/projects/clean/': ['/thumbnails/clean.jpg', 'Desk cleaning study'],
    '/tooling/printer/': ['/thumbnails/sparky.jpeg', 'Sparky, a heavily modified Ender 3 Pro'],
    '/tooling/fume-extraction/': ['/images/tooling/fume-extraction/homepage.jpeg', 'Twin extraction ducts running from stacked workshop enclosures to the window'],
    '/tooling/twister/': ['/thumbnails/twister.jpg', 'Twister machine, control electronics and copper carriage'],
    '/tooling/halogen-oven/': ['/thumbnails/floodlamp-oven.jpg', 'Floodlamp oven, controller and two ForceField boards']
  };

  const path = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : `${window.location.pathname}/`;
  const heroDetails = mobileHeroes[path];
  const header = document.querySelector('.text-column > header, .mobile-report-project-intro');
  const storyMedia = document.querySelector('.container > .image-column');
  const hasLeadStoryMedia = storyMedia?.querySelector('.project-lead-media');

  if (!heroDetails || !header || hasLeadStoryMedia) return;

  const mobileLayout = window.matchMedia('(max-width: 820px)');
  let hero = null;

  const syncHeroPosition = () => {
    if (window.PortfolioFullscreen.isTransitioning()) return;
    if (mobileLayout.matches) {
      if (!hero) {
        hero = document.createElement('img');
        hero.className = 'mobile-project-hero';
        hero.src = heroDetails[0];
        hero.alt = heroDetails[1];
        hero.decoding = 'async';
        hero.fetchPriority = 'high';
      }

      header.insertAdjacentElement('afterend', hero);
      return;
    }

    hero?.remove();
  };

  if (mobileLayout.addEventListener) {
    mobileLayout.addEventListener('change', syncHeroPosition);
  } else {
    mobileLayout.addListener(syncHeroPosition);
  }

  syncHeroPosition();
  document.addEventListener('portfolio-fullscreen-restored', syncHeroPosition);
})();

(() => {
  const initialiseMobileStoryMedia = () => {
    const source = document.querySelector('.container > .image-column');
    const header = document.querySelector('.text-column > header');
    const main = document.querySelector('.text-column > main');

    if (!source || !header || !main) return;

    const sourceChildren = Array.from(source.children)
      .filter((child) => child.tagName !== 'BR');

    if (!sourceChildren.length) return;

    const records = sourceChildren.map((node) => {
      const marker = document.createComment('mobile-story-media');
      node.before(marker);
      return { node, marker };
    });

    const entries = [];
    let pendingLabels = [];

    sourceChildren.forEach((node) => {
      if (node.matches('p')) {
        pendingLabels.push(node);
        return;
      }

      entries.push({
        media: node,
        nodes: [node, ...pendingLabels]
      });
      pendingLabels = [];
    });

    if (pendingLabels.length && entries.length) {
      entries[entries.length - 1].nodes.push(...pendingLabels);
    }

    if (!entries.length) return;

    const isSectionLabel = (element) => {
      if (element.tagName !== 'P') return false;
      if (element.parentElement?.firstElementChild !== element) return false;
      if (element.children.length !== 1) return false;
      return element.firstElementChild?.matches('b, strong') ?? false;
    };

    const storyTargets = Array.from(main.querySelectorAll('section p, section blockquote, section ul, section ol'))
      .filter((element) => !element.matches('.footnote') && !isSectionLabel(element));
    const fallbackTargets = Array.from(main.querySelectorAll(':scope > section'));
    const targets = storyTargets.length ? storyTargets : fallbackTargets;

    if (!targets.length) return;

    const contextualClasses = Array.from(source.classList)
      .filter((className) => className !== 'column' && className !== 'image-column');
    const mobileLayout = window.matchMedia('(max-width: 820px)');
    const slots = [];
    let active = false;

    const createSlot = (target, lead = false) => {
      const slot = document.createElement('div');
      slot.classList.add('image-column', 'mobile-story-media', ...contextualClasses);
      if (lead) slot.classList.add('mobile-story-media--lead');
      target.insertAdjacentElement('afterend', slot);
      slots.push(slot);
      return slot;
    };

    const findExplicitTarget = (entry) => {
      const selector = entry.media.dataset.mobileAfter;
      if (!selector) return null;

      try {
        return main.querySelector(selector);
      } catch (error) {
        console.warn(`Invalid mobile story selector: ${selector}`);
        return null;
      }
    };

    const mount = () => {
      if (active) return;
      active = true;
      source.classList.add('mobile-story-source--emptied');
      source.setAttribute('aria-hidden', 'true');

      const leadEntry = entries.find((entry) => (
        entry.media.matches('.project-lead-media') ||
        entry.media.querySelector('.project-lead-media')
      ));

      if (leadEntry) {
        const leadSlot = createSlot(header, true);
        leadEntry.nodes.forEach((node) => leadSlot.append(node));
      }

      const remainingEntries = entries.filter((entry) => entry !== leadEntry);
      const targetSlots = new Map();

      remainingEntries.forEach((entry, index) => {
        const explicitTarget = findExplicitTarget(entry);
        const proportionalIndex = Math.min(
          targets.length - 1,
          Math.floor(((index + 0.5) * targets.length) / remainingEntries.length)
        );
        const target = explicitTarget || targets[proportionalIndex];
        let slot = targetSlots.get(target);

        if (!slot) {
          slot = createSlot(target);
          targetSlots.set(target, slot);
        }

        entry.nodes.forEach((node) => slot.append(node));
      });
    };

    const restore = () => {
      if (!active) return;
      active = false;

      records.forEach(({ node, marker }) => {
        marker.parentNode?.insertBefore(node, marker.nextSibling);
      });

      slots.splice(0).forEach((slot) => slot.remove());
      source.classList.remove('mobile-story-source--emptied');
      source.removeAttribute('aria-hidden');
    };

    const sync = () => {
      // Fullscreen may cross the mobile breakpoint; keep the playing node in place.
      if (window.PortfolioFullscreen.isTransitioning()) return;

      if (mobileLayout.matches) {
        mount();
      } else {
        restore();
      }
    };

    if (mobileLayout.addEventListener) {
      mobileLayout.addEventListener('change', sync);
    } else {
      mobileLayout.addListener(sync);
    }

    window.addEventListener('resize', sync, { passive: true });
    document.addEventListener('portfolio-fullscreen-restored', sync);
    sync();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseMobileStoryMedia, { once: true });
  } else {
    initialiseMobileStoryMedia();
  }
})();

(() => {
  const initialiseTwisterEdgeSurfaces = () => {
    const closure = document.querySelector('.twister-closure');
    if (!closure) return;

    let attempts = 0;

    const connect = () => {
      const edgeBlurs = Array.from(document.querySelectorAll('[data-edge-blur]'));

      if (edgeBlurs.length < 2) {
        attempts += 1;
        if (attempts < 120) window.requestAnimationFrame(connect);
        return;
      }

      const darkSurface = getComputedStyle(closure).backgroundColor || 'rgb(0, 0, 0)';
      const pageSurface = () => getComputedStyle(document.body).backgroundColor || 'rgb(255, 255, 255)';
      let scheduled = false;

      const surfaceAt = (y, darkRects) => (
        darkRects.some((rect) => y >= rect.top && y < rect.bottom) ? darkSurface : pageSurface()
      );

      const renderEdge = (edgeBlur, darkRects) => {
        const edgeRect = edgeBlur.getBoundingClientRect();
        if (!edgeRect.height) return;

        const topSurface = surfaceAt(edgeRect.top + 0.5, darkRects);
        const bottomSurface = surfaceAt(edgeRect.bottom - 0.5, darkRects);
        let surfaceBefore = topSurface;
        let surfaceAfter = bottomSurface;
        let cut = 100;

        if (topSurface !== bottomSurface) {
          const boundary = darkRects
            .flatMap((rect) => [rect.top, rect.bottom])
            .find((position) => position > edgeRect.top && position < edgeRect.bottom);

          if (boundary !== undefined) {
            cut = ((boundary - edgeRect.top) / edgeRect.height) * 100;
          }
        }

        if (edgeBlur.dataset.edgeBlur === 'top') {
          surfaceBefore = bottomSurface;
          surfaceAfter = topSurface;
          cut = 100 - cut;
        }

        const boundedCut = Math.max(0, Math.min(100, cut));
        const state = `${surfaceBefore}|${surfaceAfter}|${boundedCut.toFixed(3)}`;

        if (edgeBlur.dataset.edgeSurfaceState === state) return;

        edgeBlur.dataset.edgeSurfaceState = state;
        edgeBlur.style.setProperty('--edge-surface-before', surfaceBefore);
        edgeBlur.style.setProperty('--edge-surface-after', surfaceAfter);
        edgeBlur.style.setProperty('--edge-surface-cut', `${boundedCut}%`);
      };

      const renderNavbar = (navbar, darkRects) => {
        if (!navbar) return;

        const navSurface = navbar.querySelector(':scope > nav') || navbar;
        const navRect = navSurface.getBoundingClientRect();
        if (!navRect.height) return;

        const topSurface = surfaceAt(navRect.top + 0.5, darkRects);
        const bottomSurface = surfaceAt(navRect.bottom - 0.5, darkRects);
        let cut = 100;

        if (topSurface !== bottomSurface) {
          const boundary = darkRects
            .flatMap((rect) => [rect.top, rect.bottom])
            .find((position) => position > navRect.top && position < navRect.bottom);

          if (boundary !== undefined) {
            cut = ((boundary - navRect.top) / navRect.height) * 100;
          }
        }

        const boundedCut = Math.max(0, Math.min(100, cut));
        const mode = topSurface !== bottomSurface
          ? 'split'
          : topSurface === darkSurface
            ? 'dark'
            : 'light';
        const state = `${topSurface}|${bottomSurface}|${boundedCut.toFixed(3)}|${mode}`;

        if (navbar.dataset.twisterNavState === state) return;

        navbar.dataset.twisterNavState = state;
        navbar.style.setProperty('--twister-nav-surface-before', topSurface);
        navbar.style.setProperty('--twister-nav-surface-after', bottomSurface);
        navbar.style.setProperty('--twister-nav-surface-cut', `${boundedCut}%`);
        navbar.classList.toggle('twister-navbar--adaptive', mode === 'split');
        navbar.classList.toggle('twister-navbar--dark', mode === 'dark');
      };

      const render = () => {
        scheduled = false;
        const darkRects = [closure.getBoundingClientRect()];
        const footerContainer = document.getElementById('footer-container');

        if (footerContainer?.offsetHeight) {
          darkRects.push(footerContainer.getBoundingClientRect());
        }

        edgeBlurs.forEach((edgeBlur) => renderEdge(edgeBlur, darkRects));
        renderNavbar(document.getElementById('navbar-container'), darkRects);
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(render);
      };

      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('load', schedule, { once: true });
      document.addEventListener('project-nav-position', render);
      document.addEventListener('portfolio-theme-change', schedule);

      if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(closure);
        edgeBlurs.forEach((edgeBlur) => resizeObserver.observe(edgeBlur));
      }

      const pageObserver = new MutationObserver(schedule);
      pageObserver.observe(document.body, { childList: true });

      document.fonts?.ready.then(schedule);
      render();
    };

    connect();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseTwisterEdgeSurfaces, { once: true });
  } else {
    initialiseTwisterEdgeSurfaces();
  }
})();

(() => {
  const initialiseOgmaThemeMedia = () => {
    const lightVideo = document.querySelector('.ogma-hypothetical-render--light');
    if (!(lightVideo instanceof HTMLVideoElement)) return;

    const syncPlayback = () => {
      const darkTheme = document.documentElement.dataset.theme === 'dark';

      if (darkTheme) {
        lightVideo.pause();
      } else {
        lightVideo.play().catch(() => {});
      }
    };

    document.addEventListener('portfolio-theme-change', syncPlayback);
    syncPlayback();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseOgmaThemeMedia, { once: true });
  } else {
    initialiseOgmaThemeMedia();
  }
})();
