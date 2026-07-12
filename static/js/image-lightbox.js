document.addEventListener('DOMContentLoaded', () => {
  if (!document.body.matches('.project-page, .home-page')) return;

  const images = Array.from(document.querySelectorAll('img')).filter((image) => {
    return !image.closest('a, button, .image-lightbox') && !image.classList.contains('no-lightbox');
  });

  if (!images.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Enlarged image');

  const enlargedImage = document.createElement('img');
  enlargedImage.className = 'image-lightbox__image';

  const closeButton = document.createElement('button');
  closeButton.className = 'image-lightbox__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close enlarged image');
  closeButton.textContent = '×';

  overlay.append(enlargedImage, closeButton);
  document.body.appendChild(overlay);

  let previouslyFocused = null;

  const close = () => {
    if (overlay.hidden) return;
    overlay.hidden = true;
    enlargedImage.removeAttribute('src');
    document.body.classList.remove('lightbox-open');
    previouslyFocused?.focus();
  };

  const open = (image) => {
    previouslyFocused = image;
    enlargedImage.src = image.currentSrc || image.src;
    enlargedImage.alt = image.alt || '';
    overlay.hidden = false;
    document.body.classList.add('lightbox-open');
    closeButton.focus();
  };

  images.forEach((image) => {
    image.dataset.lightboxReady = 'true';
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', image.alt ? `Enlarge image: ${image.alt}` : 'Enlarge image');
    image.addEventListener('click', () => open(image));
    image.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(image);
      }
    });
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === enlargedImage) close();
  });
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
});
