(() => {
  const STORAGE_KEY = 'portfolioMusicStateV5';
  const DEFAULT_VOLUME = 1 / 3;
  const MAX_OUTPUT_VOLUME = 0.45;
  const HANDOFF_MAX_AGE_MS = 15000;
  const tracks = [
    {
      title: 'Cartoon, Jéja — On & On (feat. Daniel Levi)',
      src: '/static/audio/cartoon-jeja-on-and-on.mp3',
      url: 'https://ncs.io/onandon'
    },
    {
      title: 'Ross Bugden — Algoma',
      src: '/static/audio/ross-bugden-algoma.mp3',
      url: 'https://soundcloud.com/rossbugden/migration'
    },
    {
      title: 'El Equipo Del Norte — Bossa Cara',
      src: '/static/audio/el-equipo-del-norte-bossa-cara.mp3',
      url: 'https://www.epidemicsound.com/track/72kZ9Qi5Q4/'
    },
    {
      title: 'Lupus Nocte — Howling',
      src: '/static/audio/lupus-nocte-howling.mp3',
      url: 'https://www.epidemicsound.com/music/tracks/dd9e3e35-43a1-355f-8fac-a1b5b8294e54/'
    },
    {
      title: 'Cartoon, Jéja — Why We Lose (feat. Coleman Trapp)',
      src: '/static/audio/cartoon-jeja-why-we-lose.mp3',
      url: 'https://ncs.io/whywelose'
    }
  ];

  const isFreshHandoff = handoffAt => {
    if (!Number.isFinite(handoffAt)) return false;
    const age = Date.now() - handoffAt;
    return age >= 0 && age <= HANDOFF_MAX_AGE_MS;
  };

  const readState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const index = Number.isInteger(saved?.index) ? saved.index : 0;
      const time = Number.isFinite(saved?.time) && saved.time >= 0 ? saved.time : 0;
      const volumeWasSet = saved?.volumeWasSet === true;
      const volume = volumeWasSet && Number.isFinite(saved?.volume)
        ? Math.min(1, Math.max(0, saved.volume))
        : DEFAULT_VOLUME;
      const handoffAt = Number.isFinite(saved?.handoffAt) && saved.handoffAt > 0
        ? saved.handoffAt
        : null;
      const hiddenAt = Number.isFinite(saved?.hiddenAt) && saved.hiddenAt > 0
        ? saved.hiddenAt
        : null;

      return {
        index: ((index % tracks.length) + tracks.length) % tracks.length,
        time,
        playing: typeof saved?.playing === 'boolean' ? saved.playing : false,
        volume,
        volumeWasSet,
        handoffAt,
        hiddenAt
      };
    } catch {
      return {
        index: 0,
        time: 0,
        playing: false,
        volume: DEFAULT_VOLUME,
        volumeWasSet: false,
        handoffAt: null,
        hiddenAt: null
      };
    }
  };

  const audio = new Audio();
  const state = readState();
  const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
  const initialHandoffAt = state.handoffAt ??
    (navigationEntry?.type === 'back_forward' ? state.hiddenAt : null);
  const initialShouldPlay = state.playing && isFreshHandoff(initialHandoffAt);
  const mountedPlayers = new Set();
  let pendingTime = state.time;
  let wantsPlayback = state.playing;
  let isPlaying = false;
  let playAttemptInFlight = false;
  let loadGeneration = 0;
  let lastSavedSecond = -1;
  let pendingHandoffAt = null;
  let handoffRequested = false;

  audio.preload = 'auto';

  const outputVolumeFor = sliderVolume =>
    Math.min(1, sliderVolume ** 2 * MAX_OUTPUT_VOLUME);

  audio.volume = outputVolumeFor(state.volume);

  const saveState = (captureTime = false, markHandoff = false, markHidden = false) => {
    if (captureTime && Number.isFinite(audio.currentTime)) {
      state.time = audio.currentTime;
    }

    if (markHandoff || markHidden) {
      const timestamp = Date.now();
      if (markHandoff) state.handoffAt = timestamp;
      if (markHidden) state.hiddenAt = timestamp;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Playback still works when storage is unavailable.
    }
  };

  const dispatchPlaybackState = () => {
    window.dispatchEvent(new CustomEvent('portfolio-music-state', {
      detail: { playing: isPlaying, index: state.index }
    }));
  };

  const stopTicker = root => {
    root._tickerAnimation?.cancel();
    root._tickerAnimation = null;
  };

  const startTicker = root => {
    const ticker = root.querySelector('.portfolio-audio-player__ticker');
    const label = root.querySelector('[data-audio-track]');
    if (!ticker || !label) return;

    stopTicker(root);
    label.style.transform = '';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    requestAnimationFrame(() => {
      const distance = Math.ceil(label.scrollWidth - ticker.clientWidth);
      if (distance <= 2) return;

      root._tickerAnimation = label.animate(
        [
          { transform: 'translateX(0)' },
          { transform: `translateX(-${distance}px)` }
        ],
        {
          duration: Math.max(4500, distance * 55),
          delay: 700,
          direction: 'alternate',
          iterations: Infinity,
          easing: 'ease-in-out'
        }
      );
    });
  };

  const renderPlayer = root => {
    const track = tracks[state.index];
    const label = root.querySelector('[data-audio-track]');
    const toggle = root.querySelector('[data-audio-toggle]');
    const volume = root.querySelector('[data-audio-volume]');

    if (label) {
      label.textContent = track.title;
      label.href = track.url;
      label.title = track.title;
    }

    if (toggle) {
      toggle.textContent = isPlaying ? 'Ⅱ' : '▶';
      toggle.setAttribute('aria-label', isPlaying ? 'Pause music' : 'Play music');
      toggle.title = isPlaying ? 'Pause music' : 'Play music';
    }

    if (volume) {
      volume.value = String(state.volume);
      volume.title = `Music volume: ${Math.round(state.volume * 100)}%`;
    }

    startTicker(root);
  };

  const renderAll = () => mountedPlayers.forEach(renderPlayer);

  const attemptPlay = () => {
    if (!wantsPlayback || playAttemptInFlight || audio.readyState === 0) return;

    const generation = loadGeneration;
    playAttemptInFlight = true;
    state.playing = true;
    renderAll();
    saveState();

    const playPromise = audio.play();
    if (!playPromise) {
      playAttemptInFlight = false;
      return;
    }

    playPromise.catch(() => {
      if (generation !== loadGeneration) return;
      isPlaying = false;
      renderAll();
      dispatchPlaybackState();
    }).finally(() => {
      if (generation === loadGeneration) playAttemptInFlight = false;
    });
  };

  const loadTrack = (index, time = 0, shouldPlay = true, handoffAt = null) => {
    loadGeneration += 1;
    playAttemptInFlight = false;
    state.index = ((index % tracks.length) + tracks.length) % tracks.length;
    state.time = Math.max(0, time);
    state.playing = shouldPlay;
    wantsPlayback = shouldPlay;
    isPlaying = false;
    pendingTime = state.time;
    pendingHandoffAt = Number.isFinite(handoffAt) ? handoffAt : null;
    state.handoffAt = null;
    state.hiddenAt = null;

    audio.src = tracks[state.index].src;
    audio.load();
    renderAll();
    saveState();

    if (!shouldPlay) dispatchPlaybackState();
  };

  const togglePlayback = () => {
    if (!isPlaying) {
      wantsPlayback = true;
      state.playing = true;
      attemptPlay();
      return;
    }

    wantsPlayback = false;
    isPlaying = false;
    state.playing = false;
    audio.pause();
    renderAll();
    saveState(true);
    dispatchPlaybackState();
  };

  const nextTrack = () => loadTrack(state.index + 1, 0, true);

  const mount = root => {
    if (!root || mountedPlayers.has(root)) return;

    mountedPlayers.add(root);
    root.querySelector('[data-audio-toggle]')?.addEventListener('click', togglePlayback);
    root.querySelector('[data-audio-next]')?.addEventListener('click', nextTrack);
    root.querySelector('[data-audio-volume]')?.addEventListener('input', event => {
      const volume = Number(event.currentTarget.value);
      state.volume = Math.min(1, Math.max(0, volume));
      state.volumeWasSet = true;
      audio.volume = outputVolumeFor(state.volume);
      event.currentTarget.title = `Music volume: ${Math.round(state.volume * 100)}%`;
      saveState();
    });
    renderPlayer(root);
  };

  const mountAll = () => {
    document.querySelectorAll('[data-portfolio-audio-player]').forEach(mount);
  };

  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(pendingTime)) {
      let resumeTime = pendingTime;
      const handoffAge = Number.isFinite(pendingHandoffAt)
        ? Date.now() - pendingHandoffAt
        : null;

      pendingTime = null;
      pendingHandoffAt = null;

      if (
        wantsPlayback &&
        Number.isFinite(handoffAge) &&
        handoffAge >= 0 &&
        handoffAge <= HANDOFF_MAX_AGE_MS
      ) {
        resumeTime += handoffAge / 1000;
      }

      if (Number.isFinite(audio.duration) && resumeTime >= audio.duration) {
        loadTrack(state.index + 1, resumeTime - audio.duration, wantsPlayback);
        return;
      }

      const maximum = Number.isFinite(audio.duration)
        ? Math.max(0, audio.duration - 0.05)
        : resumeTime;
      const restoredTime = Math.min(resumeTime, maximum);
      audio.currentTime = restoredTime;
      state.time = restoredTime;
      saveState();
    }

    if (wantsPlayback && audio.paused) attemptPlay();
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    state.playing = true;
    renderAll();
    saveState();
    dispatchPlaybackState();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    renderAll();
    dispatchPlaybackState();
  });

  audio.addEventListener('timeupdate', () => {
    const second = Math.floor(audio.currentTime);
    if (second === lastSavedSecond) return;
    lastSavedSecond = second;
    saveState(true);
  });

  audio.addEventListener('ended', nextTrack);
  window.addEventListener('resize', renderAll);
  window.addEventListener('pagehide', () => saveState(true, handoffRequested, true));
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;

    const restoredState = readState();
    const restoredHandoffAt = restoredState.handoffAt ?? restoredState.hiddenAt;
    const restoredShouldPlay =
      restoredState.playing && isFreshHandoff(restoredHandoffAt);
    handoffRequested = false;
    state.volume = restoredState.volume;
    state.volumeWasSet = restoredState.volumeWasSet;
    audio.volume = outputVolumeFor(state.volume);
    loadTrack(
      restoredState.index,
      restoredState.time,
      restoredShouldPlay,
      restoredHandoffAt
    );
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveState(true);
      return;
    }

    if (!wantsPlayback) return;

    if (audio.ended) {
      nextTrack();
      return;
    }

    if (audio.paused) attemptPlay();
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (
      !link ||
      link.target === '_blank' ||
      link.hasAttribute('download') ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const destination = new URL(link.href, window.location.href);
    const isSameDocumentHash =
      destination.pathname === window.location.pathname &&
      destination.search === window.location.search &&
      Boolean(destination.hash);

    if (destination.origin === window.location.origin && !isSameDocumentHash) {
      handoffRequested = true;
      saveState(true);
    }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (
      !wantsPlayback ||
      isPlaying ||
      event.target.closest('[data-portfolio-audio-player]')
    ) return;

    attemptPlay();
  }, true);

  window.PortfolioMusic = {
    mount,
    mountAll,
    pause: () => {
      wantsPlayback = false;
      isPlaying = false;
      state.playing = false;
      if (audio.paused) {
        renderAll();
        saveState(true);
        dispatchPlaybackState();
        return;
      }

      state.playing = false;
      audio.pause();
      saveState(true);
    },
    isPlaying: () => isPlaying,
    next: nextTrack
  };

  mountAll();
  loadTrack(state.index, state.time, initialShouldPlay, initialHandoffAt);
})();
