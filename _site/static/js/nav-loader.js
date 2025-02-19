// nav-loader.js
document.addEventListener('DOMContentLoaded', async function() {
    // Initially hide the body content to prevent flash of unstyled content
    document.body.style.visibility = 'hidden';

    try {
        // Attempt to fetch the navbar HTML content
        const response = await fetch('/static/navbar.html');
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
        
        // Set up random link functionality if it exists
        const randomLink = document.getElementById('randomLink');
        if (randomLink) {
            const randomSites = [
                'https://en.wikipedia.org/wiki/Special:Random',
                'https://www.wikihow.com/special:randomizer'
            ];
            
            randomLink.addEventListener('click', function(e) {
                e.preventDefault();
                const randomSite = randomSites[Math.floor(Math.random() * randomSites.length)];
                window.open(randomSite, '_blank');
            });
        }
        
        // Handle active state for current page in navigation
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });

        // Ensure all navbar content is loaded before showing the page
        // This prevents layout shifts and ensures smooth appearance
        window.requestAnimationFrame(() => {
            // Make content visible
            document.body.style.visibility = 'visible';
            // Add loaded class for fade-in effect
            document.body.classList.add('content-loaded');
        });

    } catch (error) {
        console.error('Navigation loading error:', error);
        // Even if navigation fails, ensure content becomes visible
        document.body.style.visibility = 'visible';
        document.body.classList.add('content-loaded');
    }

});




