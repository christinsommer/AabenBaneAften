import sharp from 'sharp';

// Resize the approved extracted artwork; never redraw the app identity.
for (const size of [32, 180, 192, 512]) {
  await sharp('public/brand/classic-icon.png').resize(size, size).png()
    .toFile(`public/brand/icon-${size}.png`);
}
console.log('Approved app icons generated: 32, 180, 192, 512 pixels.');
