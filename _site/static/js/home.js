const galleryImages = [
  ['/thumbnails/hands-cool.jpg', 'A selection of other design and fabrication work'],
  ['/images/slidesh/bracket.png', 'A fabricated bracket'],
  ['/images/slidesh/lathe.png', 'Lathe work'],
  ['/images/slidesh/botl.png', 'A bottle project'],
  ['/images/slidesh/optimal.png', 'A design iteration'],
  ['/images/slidesh/charge.png', 'An electronics charging project']
];

const gallery = document.querySelector('.work-gallery');
const easterEgg = document.querySelector('.gallery-easter-egg');
const homePage = document.querySelector('.home-page');
const previousPreview = document.querySelector('.video-carousel__preview--previous');
const nextPreview = document.querySelector('.video-carousel__preview--next');
const previousArrow = document.querySelector('.video-carousel__arrow--previous');
const nextArrow = document.querySelector('.video-carousel__arrow--next');
const discoveryCounter = document.querySelector('.discovery-counter');
const discoveryButton = document.querySelector('.discovery-counter__button');
const discoveryResult = document.querySelector('.discovery-counter__result');
const carouselVideos = [
  { id: 'mBqu09YMTPs', title: 'Baden Powell - Valsa sem nome' },
  { id: '4VlZ3OiRReM', title: 'Jacob Collier - Keyscape Sessions' },
  { id: 'RtvImndxZn8', title: 'Radiohead - Daydreaming' },
  { id: 'D0Kw7C6LtoY', title: "Victor Wooten - Isn't She Lovely" },
  { id: 'HAi1pn3kBqE', title: 'I. S. Bach - Toccata and Fugue in D minor' },
  { id: '-GRwcKlyfp4', title: 'Cory Wong - Meditation (Live at Brooklyn Steel)' },
  { id: 'LRoBmXcHgb0', title: 'The Smoothest Sax Solo' },
  { id: 'RxZSP1Dc78Q', title: 'Montserrat Caballé - O mio babbino caro' }
];
let activeVideo = 3;
let requestedVideoId = carouselVideos[activeVideo].id;
let youtubeApiPromise;
let youtubePlayer;
let youtubePlayerReady = false;
let loadedVideoId = '';

const thumbnailFor = video => `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

const ordinal = number => {
  const remainder100 = number % 100;
  const formatted = number.toLocaleString('en');
  if (remainder100 >= 11 && remainder100 <= 13) return `${formatted}th`;

  return `${formatted}${({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] || 'th'}`;
};

const setMusicPlaying = playing => {
  homePage?.classList.toggle('music-is-playing', playing);
};

const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      resolve(window.YT);
    };

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', reject, { once: true });
    document.head.append(script);
  });

  return youtubeApiPromise;
};

const initialiseYouTubePlayer = async () => {
  if (youtubePlayer) return;

  try {
    const YT = await loadYouTubeApi();
    if (youtubePlayer) return;

    const initialVideoId = requestedVideoId;
    youtubePlayer = new YT.Player('gallery-easter-player', {
      host: 'https://www.youtube.com',
      width: '100%',
      height: '100%',
      videoId: initialVideoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: event => {
          youtubePlayerReady = true;
          const iframe = event.target.getIframe();
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
          iframe.title = carouselVideos[activeVideo].title;

          loadedVideoId = requestedVideoId;
          if (requestedVideoId === initialVideoId) {
            event.target.playVideo();
          } else {
            event.target.loadVideoById(requestedVideoId);
          }
        },
        onStateChange: event => {
          setMusicPlaying(event.data === YT.PlayerState.PLAYING);
        },
        onError: () => setMusicPlaying(false)
      }
    });
  } catch {
    setMusicPlaying(false);
  }
};

const renderCarousel = () => {
  if (!previousPreview || !nextPreview) return;

  const previousIndex = (activeVideo - 1 + carouselVideos.length) % carouselVideos.length;
  const nextIndex = (activeVideo + 1) % carouselVideos.length;
  const active = carouselVideos[activeVideo];
  const previous = carouselVideos[previousIndex];
  const next = carouselVideos[nextIndex];
  requestedVideoId = active.id;

  if (youtubePlayerReady && loadedVideoId !== requestedVideoId) {
    setMusicPlaying(false);
    loadedVideoId = requestedVideoId;
    youtubePlayer.loadVideoById(requestedVideoId);
    youtubePlayer.getIframe().title = active.title;
  } else if (!youtubePlayer) {
    initialiseYouTubePlayer();
  }

  previousPreview.dataset.videoIndex = previousIndex;
  previousPreview.setAttribute('aria-label', `Play ${previous.title}`);
  previousPreview.querySelector('img').src = thumbnailFor(previous);
  previousPreview.querySelector('img').alt = previous.title;

  nextPreview.dataset.videoIndex = nextIndex;
  nextPreview.setAttribute('aria-label', `Play ${next.title}`);
  nextPreview.querySelector('img').src = thumbnailFor(next);
  nextPreview.querySelector('img').alt = next.title;
};

const showVideo = index => {
  activeVideo = (index + carouselVideos.length) % carouselVideos.length;
  renderCarousel();
};

const revealEasterEgg = () => {
  if (!easterEgg || easterEgg.classList.contains('is-visible')) return;

  renderCarousel();
  easterEgg.removeAttribute('inert');
  easterEgg.setAttribute('aria-hidden', 'false');
  easterEgg.classList.add('is-visible');
  gallery?.setAttribute('aria-expanded', 'true');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    easterEgg.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start'
    });
  });
};

if (gallery) {
  const image = gallery.querySelector('img');
  let currentImage = 0;

  gallery.addEventListener('click', () => {
    currentImage = (currentImage + 1) % galleryImages.length;
    [image.src, image.alt] = galleryImages[currentImage];

    if (currentImage === 0) revealEasterEgg();
  });
}

previousPreview?.addEventListener('click', () => showVideo(Number(previousPreview.dataset.videoIndex)));
nextPreview?.addEventListener('click', () => showVideo(Number(nextPreview.dataset.videoIndex)));
previousArrow?.addEventListener('click', () => showVideo(activeVideo - 1));
nextArrow?.addEventListener('click', () => showVideo(activeVideo + 1));

discoveryButton?.addEventListener('click', async () => {
  const endpoint = discoveryCounter?.dataset.endpoint;
  if (!endpoint || !discoveryResult) return;

  discoveryButton.disabled = true;
  discoveryButton.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error('Counter unavailable');

    const { count } = await response.json();
    if (!Number.isInteger(count) || count < 1) throw new Error('Invalid count');

    discoveryButton.hidden = true;
    discoveryResult.textContent = `you’re the ${ordinal(count)} person to find this!`;
    discoveryResult.hidden = false;
  } catch {
    discoveryButton.disabled = false;
    discoveryResult.textContent = 'couldn’t count that one — try again';
    discoveryResult.hidden = false;
  } finally {
    discoveryButton.removeAttribute('aria-busy');
  }
});
