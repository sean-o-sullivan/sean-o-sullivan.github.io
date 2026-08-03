(() => {
  const STORAGE_KEY = 'portfolioMusicStateV5';
  const DEFAULT_VOLUME = 1 / 3;
  const MAX_OUTPUT_VOLUME = 0.45;
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

  const readState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const index = Number.isInteger(saved?.index) ? saved.index : 0;
      const time = Number.isFinite(saved?.time) && saved.time >= 0 ? saved.time : 0;
      const volumeWasSet = saved?.volumeWasSet === true;
      const volume = volumeWasSet && Number.isFinite(saved?.volume)
        ? Math.min(1, Math.max(0, saved.volume))
        : DEFAULT_VOLUME;

      return {
        index: ((index % tracks.length) + tracks.length) % tracks.length,
        time,
        playing: typeof saved?.playing === 'boolean' ? saved.playing : true,
        volume,
        volumeWasSet
      };
    } catch {
      return {
        index: 0,
        time: 0,
        playing: true,
        volume: DEFAULT_VOLUME,
        volumeWasSet: false
      };
    }
  };

  const audio = new Audio();
  const state = readState();
  const mountedPlayers = new Set();
  let pendingTime = state.time;
  let wantsPlayback = state.playing;
  let isPlaying = false;
  let playAttemptInFlight = false;
  let loadGeneration = 0;
  let lastSavedSecond = -1;

  audio.preload = 'auto';

  const outputVolumeFor = sliderVolume =>
    Math.min(1, sliderVolume ** 2 * MAX_OUTPUT_VOLUME);

  audio.volume = outputVolumeFor(state.volume);

  const saveState = (captureTime = false) => {
    if (captureTime && Number.isFinite(audio.currentTime)) {
      state.time = audio.currentTime;
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

  const loadTrack = (index, time = 0, shouldPlay = true) => {
    loadGeneration += 1;
    playAttemptInFlight = false;
    state.index = ((index % tracks.length) + tracks.length) % tracks.length;
    state.time = Math.max(0, time);
    state.playing = shouldPlay;
    wantsPlayback = shouldPlay;
    isPlaying = false;
    pendingTime = state.time;

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
      const maximum = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.05) : pendingTime;
      audio.currentTime = Math.min(pendingTime, maximum);
      pendingTime = null;
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
  window.addEventListener('pagehide', () => saveState(true));
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
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

    const destination = new URL(link.href, window.location.href);
    if (destination.origin === window.location.origin) saveState(true);
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
  loadTrack(state.index, state.time, state.playing);
})();
