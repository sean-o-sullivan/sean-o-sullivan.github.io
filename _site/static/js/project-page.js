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

  if (!heroDetails || !header) return;

  const mobileLayout = window.matchMedia('(max-width: 820px)');
  let hero = null;

  const syncHeroPosition = () => {
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
})();
