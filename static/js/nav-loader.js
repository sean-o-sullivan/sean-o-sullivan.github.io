// nav-loader.js
document.addEventListener('DOMContentLoaded', async function() {

    try {
        const response = await fetch('/static/navbar.html');
        if (!response.ok) {
            throw new Error(`Failed to load navbar: ${response.status}`);
        }
        const navHTML = await response.text();
        
        const navContainer = document.getElementById('navbar-container');
        if (!navContainer) {
            throw new Error('Navbar container not found');
        }
        
        navContainer.innerHTML = navHTML;
        
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
        
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });
    } catch (error) {
        console.error('Navigation loading error:', error);
    }
});
