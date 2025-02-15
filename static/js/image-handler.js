// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add loaded class to body
    document.body.classList.add('loaded');

    const overlay = document.getElementById('fullscreen-overlay');
    const fullscreenImg = document.getElementById('fullscreen-image');

    // Set up image click handlers
    document.querySelectorAll('.clickable-image').forEach(img => {
        img.addEventListener('click', function() {
            fullscreenImg.src = this.src;
            fullscreenImg.alt = this.alt;
            overlay.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });
    });

    // Close overlay on click
    overlay.addEventListener('click', function() {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    });

    // Close overlay on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && overlay.style.display === 'block') {
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    });
});
