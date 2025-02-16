document.addEventListener('DOMContentLoaded', function() {
    const footerContainer = document.getElementById('footer-container');
    if (footerContainer) {
        footerContainer.innerHTML = `
            <footer class="footer">
                <p>© 2025 | Seán O'Sullivan</p>
            </footer>
        `;
    }
});