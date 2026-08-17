// Apply the saved theme before the page renders, then keep every shared toggle in sync.
(() => {
  if (window.PortfolioTheme) return;

  const storageKey = 'sean-portfolio-theme';
  const root = document.documentElement;
  const systemPreference = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  let followsSystem = true;

  const readStoredTheme = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  };

  const currentTheme = () => root.dataset.theme === 'dark' ? 'dark' : 'light';
  const systemTheme = () => systemPreference?.matches ? 'dark' : 'light';

  const sync = (scope = document) => {
    const theme = currentTheme();
    const isDark = theme === 'dark';
    const action = isDark ? 'Switch to light mode' : 'Switch to dark mode';

    scope.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', action);
      button.setAttribute('title', action);
      button.setAttribute('aria-pressed', String(isDark));

      button.querySelectorAll('[data-theme-icon]').forEach((icon) => {
        icon.hidden = icon.dataset.themeIcon !== theme;
      });
    });
  };

  const apply = (theme, { persist = false, notify = true } = {}) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;

    if (persist) {
      followsSystem = false;

      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch (error) {
        // The theme still works for this page when storage is unavailable.
      }
    }

    sync();

    if (notify) {
      document.dispatchEvent(new CustomEvent('portfolio-theme-change', {
        detail: { theme: nextTheme }
      }));
    }
  };

  const storedTheme = readStoredTheme();
  followsSystem = storedTheme === null;
  apply(storedTheme || systemTheme(), { notify: false });

  const handleSystemPreference = (event) => {
    if (!followsSystem) return;
    apply(event.matches ? 'dark' : 'light');
  };

  if (systemPreference?.addEventListener) {
    systemPreference.addEventListener('change', handleSystemPreference);
  } else {
    systemPreference?.addListener(handleSystemPreference);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-theme-toggle]')
      : null;

    if (!target) return;
    apply(currentTheme() === 'dark' ? 'light' : 'dark', { persist: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return;

    const nextStoredTheme = event.newValue === 'dark' || event.newValue === 'light'
      ? event.newValue
      : null;

    followsSystem = nextStoredTheme === null;
    apply(nextStoredTheme || systemTheme());
  });

  window.PortfolioTheme = {
    get: currentTheme,
    set: (theme) => apply(theme, { persist: true }),
    toggle: () => apply(currentTheme() === 'dark' ? 'light' : 'dark', { persist: true }),
    reset: () => {
      followsSystem = true;

      try {
        window.localStorage.removeItem(storageKey);
      } catch (error) {
        // Following the system still works when storage is unavailable.
      }

      apply(systemTheme());
    },
    sync
  };
})();
