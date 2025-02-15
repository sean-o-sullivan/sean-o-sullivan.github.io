// Load the navigation bar and handle active states
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Fetch the navbar content
        const response = await fetch('/static/navbar.html');
        if (!response.ok) throw new Error('Failed to load navigation');
        const navHTML = await response.text();
        
        // Insert the navbar at the start of the body
        document.body.insertAdjacentHTML('afterbegin', navHTML);
        
        // Set up random link functionality
        const randomLink = document.getElementById('randomLink');
        const randomSites = [
            'https://en.wikipedia.org/wiki/Special:Random',
            'https://www.wikihow.com/special:randomizer'
        ];
        
        randomLink.addEventListener('click', function(e) {
            e.preventDefault();
            const randomSite = randomSites[Math.floor(Math.random() * randomSites.length)];
            window.open(randomSite, '_blank');
        });
        
        // Set active state based on current page
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('.nav-links a');
        
        navLinks.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });
    } catch (error) {
        console.error('Error loading navigation:', error);
    }
});
