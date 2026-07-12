const galleryImages = [
  ['/thumbnails/hands-cool.jpg', 'A selection of other design and fabrication work'],
  ['/images/slidesh/bracket.png', 'A fabricated bracket'],
  ['/images/slidesh/lathe.png', 'Lathe work'],
  ['/images/slidesh/botl.png', 'A bottle project'],
  ['/images/slidesh/optimal.png', 'A design iteration'],
  ['/images/slidesh/charge.png', 'An electronics charging project']
];

const gallery = document.querySelector('.work-gallery');

if (gallery) {
  const image = gallery.querySelector('img');
  let currentImage = 0;

  gallery.addEventListener('click', () => {
    currentImage = (currentImage + 1) % galleryImages.length;
    [image.src, image.alt] = galleryImages[currentImage];
  });
}
