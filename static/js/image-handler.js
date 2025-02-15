// image-handler.js
document.addEventListener('DOMContentLoaded', function() {
    // Add loaded class to body for any page load animations
    document.body.classList.add('loaded');
    
    // Get the overlay and fullscreen image elements from the DOM
    const overlay = document.getElementById('fullscreen-overlay');
    const fullscreenImg = document.getElementById('fullscreen-image');
    
    // Only set up the image handlers if both required elements exist
    if (overlay && fullscreenImg) {
        // Add click handlers to all images with the 'clickable-image' class
        document.querySelectorAll('.clickable-image').forEach(img => {
            img.addEventListener('click', function() {
                // Set the fullscreen image source and alt text from the clicked image
                fullscreenImg.src = this.src;
                fullscreenImg.alt = this.alt;
                // Use flex display instead of block to enable centering
                overlay.style.display = 'flex';
                // Prevent scrolling of the background while overlay is shown
                document.body.style.overflow = 'hidden';
            });
        });
        
        // Add click handler to close the overlay when clicking anywhere on it
        overlay.addEventListener('click', function() {
            overlay.style.display = 'none';
            // Re-enable scrolling when overlay is closed
            document.body.style.overflow = '';
        });
        
        // Add keyboard handler to close overlay with Escape key
        document.addEventListener('keydown', function(e) {
            // Check if overlay is visible (using flex display now) and Escape was pressed
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                overlay.style.display = 'none';
                // Re-enable scrolling when overlay is closed
                document.body.style.overflow = '';
            }
        });
    }
});
