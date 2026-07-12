// nav-loader.js
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Attempt to fetch the navbar HTML content
        const response = await fetch('/static/navbar.html?v=2', { cache: 'no-store' });
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
            document.body.classList.add('content-loaded');
        });

    } catch (error) {
        console.error('Navigation loading error:', error);
        document.body.classList.add('content-loaded');
    }

});


