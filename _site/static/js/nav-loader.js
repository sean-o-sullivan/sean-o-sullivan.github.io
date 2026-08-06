// nav-loader.js
const loadPortfolioMusic = () => {
    if (window.PortfolioMusic) {
        window.PortfolioMusic.mountAll();
        return Promise.resolve();
    }

    if (window.portfolioMusicScriptPromise) {
        return window.portfolioMusicScriptPromise.then(() => window.PortfolioMusic?.mountAll());
    }

    window.portfolioMusicScriptPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-portfolio-music-script]');
        const script = existingScript || document.createElement('script');

        const handleLoad = () => {
            window.PortfolioMusic?.mountAll();
            resolve();
        };

        script.addEventListener('load', handleLoad, { once: true });
        script.addEventListener('error', reject, { once: true });

        if (!existingScript) {
            script.src = '/static/js/music-player.js?v=11';
            script.dataset.portfolioMusicScript = '';
            document.head.append(script);
        }
    });

    return window.portfolioMusicScriptPromise;
};

const mountEdgeBlurs = () => {
    if (!document.body.classList.contains('project-page')) return;

    ['top', 'bottom'].forEach(edge => {
        if (document.querySelector(`[data-edge-blur="${edge}"]`)) return;

        const blur = document.createElement('div');
        blur.className = `edge-blur edge-blur--${edge}`;
        blur.dataset.edgeBlur = edge;
        blur.setAttribute('aria-hidden', 'true');

        for (let layer = 0; layer < 6; layer += 1) {
            blur.append(document.createElement('span'));
        }

        document.body.append(blur);
    });
};

const initProjectNavbarReveal = (navContainer) => {
    if (!document.body.classList.contains('project-page')) return;

    const navHeight = 56;
    let lastScrollY = Math.max(0, window.scrollY);
    let reveal = Math.max(0, navHeight - lastScrollY);
    let scheduled = false;

    const render = () => {
        document.body.style.setProperty('--project-nav-reveal', `${reveal}px`);
    };

    const update = () => {
        scheduled = false;

        const scrollY = Math.max(0, window.scrollY);
        const delta = scrollY - lastScrollY;

        if (scrollY === 0) {
            reveal = navHeight;
        } else {
            reveal = Math.min(navHeight, Math.max(0, reveal - delta));
        }

        lastScrollY = scrollY;
        render();
    };

    const scheduleUpdate = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(update);
    };

    render();
    navContainer.addEventListener('focusin', () => {
        reveal = navHeight;
        render();
    });
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
};

document.addEventListener('DOMContentLoaded', async function() {
    mountEdgeBlurs();

    try {
        // Attempt to fetch the navbar HTML content
        const response = await fetch('/static/navbar.html?v=6', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load navbar: ${response.status}`);
        }
        const navHTML = await response.text();
        
        // Get reference to navbar container and validate its existence
        const navContainer = document.getElementById('navbar-container');
        if (!navContainer) {
            throw new Error('Navbar container not found');
        }
        
        // Insert the navbar HTML
        navContainer.innerHTML = navHTML;
        initProjectNavbarReveal(navContainer);
        
        // Handle active state for current page in navigation
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });

        try {
            await loadPortfolioMusic();
        } catch (error) {
            console.error('Music player loading error:', error);
        }

        // Ensure all navbar content is loaded before showing the page
        // This prevents layout shifts and ensures smooth appearance
        window.requestAnimationFrame(() => {
            document.body.classList.add('content-loaded');
        });

    } catch (error) {
        console.error('Navigation loading error:', error);
        document.body.classList.add('content-loaded');
    }

});
