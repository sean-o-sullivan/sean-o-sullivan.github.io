// Apply the saved theme before the page renders, then keep every shared toggle in sync.
(() => {
  if (window.PortfolioTheme) return;

  const storageKey = 'sean-portfolio-theme';
  const root = document.documentElement;

  const readStoredTheme = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  };

  const currentTheme = () => root.dataset.theme === 'dark' ? 'dark' : 'light';

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

  apply(readStoredTheme() || 'light', { notify: false });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest('[data-theme-toggle]')
      : null;

    if (!target) return;
    apply(currentTheme() === 'dark' ? 'light' : 'dark', { persist: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey) return;
    apply(event.newValue === 'dark' ? 'dark' : 'light');
  });

  window.PortfolioTheme = {
    get: currentTheme,
    set: (theme) => apply(theme, { persist: true }),
    toggle: () => apply(currentTheme() === 'dark' ? 'light' : 'dark', { persist: true }),
    sync
  };
})();
