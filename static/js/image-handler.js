// image-handler.js
document.addEventListener('DOMContentLoaded', function() {
    // Wait for the navigation and initial content to be loaded
    const setupImageHandlers = () => {
        // Get the overlay and fullscreen image elements from the DOM
        const overlay = document.getElementById('fullscreen-overlay');
        const fullscreenImg = document.getElementById('fullscreen-image');
        
        // Only proceed if we have both required elements
        if (overlay && fullscreenImg) {
            // Create a loading indicator for the fullscreen image
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.style.display = 'none';
            overlay.appendChild(loadingIndicator);
            
            // Handle image clicks with improved loading states
            document.querySelectorAll('.clickable-image').forEach(img => {
                img.addEventListener('click', function() {
                    // Show loading indicator
                    loadingIndicator.style.display = 'block';
                    
                    // Create a new image to preload
                    const tempImage = new Image();
                    tempImage.onload = () => {
                        // Once image is loaded, update the fullscreen view
                        fullscreenImg.src = this.src;
                        fullscreenImg.alt = this.alt;
                        loadingIndicator.style.display = 'none';
                        overlay.style.display = 'flex';
                        document.body.style.overflow = 'hidden';
                    };
                    
                    // Start loading the image
                    tempImage.src = this.src;
                });
            });
            
            // Handle closing the overlay
            const closeOverlay = () => {
                // Add a fade-out effect
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.style.display = 'none';
                    overlay.style.opacity = '1';
                    document.body.style.overflow = '';
                }, 300); // Match this with your CSS transition duration
            };
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                // Only close if clicking the overlay itself, not the image
                if (e.target === overlay) {
                    closeOverlay();
                }
            });
            
            // Close on escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.style.display === 'flex') {
                    closeOverlay();
                }
            });
            
            // Prevent image drag in fullscreen view
            fullscreenImg.addEventListener('dragstart', (e) => e.preventDefault());
        }
    };

    // If the content is already loaded, set up handlers immediately
    if (document.body.classList.contains('content-loaded')) {
        setupImageHandlers();
    } else {
        // Otherwise, wait for the content-loaded class
        const observer = new MutationObserver((mutations) => {
            if (document.body.classList.contains('content-loaded')) {
                setupImageHandlers();
                observer.disconnect();
            }
        });
        
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
});
