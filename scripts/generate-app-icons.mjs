import sharp from 'sharp';

// Code-drawn court stays inside the maskable icon's central safe area.
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0b5d3b"/>
<g fill="none" stroke="#ffffff" stroke-width="9">
<rect x="128" y="110" width="256" height="292" rx="2"/>
<path d="M154 110v292M358 110v292M128 256h256M154 184h204M154 328h204M256 184v144"/>
</g>
<circle cx="316" cy="302" r="39" fill="#d9ef60" stroke="#0b5d3b" stroke-width="8"/>
<path d="M293 273c28 9 41 30 42 55" fill="none" stroke="#ffffff" stroke-width="5"/>
</svg>`);
for(const size of [180,192,512])await sharp(svg).resize(size,size).png().toFile(`public/icon-${size}.png`);
console.log('App icons generated: 180, 192, 512 pixels.');
