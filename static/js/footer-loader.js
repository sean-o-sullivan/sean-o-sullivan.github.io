document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/static/footer.html?v=2', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load footer: ${response.status}`);
        }

        let footerContainer = document.getElementById('footer-container');
        if (!footerContainer) {
            footerContainer = document.createElement('div');
            footerContainer.id = 'footer-container';
            document.body.appendChild(footerContainer);
        }

        footerContainer.innerHTML = await response.text();
    } catch (error) {
        console.error('Footer loading error:', error);
    }
});
