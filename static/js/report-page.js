document.addEventListener('DOMContentLoaded', () => {
  const jumpLink = document.querySelector('.report-jump');
  if (!jumpLink) return;

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    jumpLink.classList.add('is-visible');
    observer.disconnect();
  }, { threshold: 0.65 });

  observer.observe(jumpLink);
});
