#!/usr/bin/env node
// Generates PWA icons as real PNGs using only Node's zlib (no image libs).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// CRC32 (PNG spec)
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}

// Draw: gradient background + white "Q" (ring + tail). contentScale shrinks it for maskable.
function makeIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const top = hex('#6c5ce7');
  const bottom = hex('#00cec9');
  const scale = maskable ? 0.62 : 1;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.29 * scale;
  const rInner = size * 0.21 * scale;
  const halfW = size * 0.045 * scale;
  const tMin = size * 0.17 * scale;
  const tMax = size * 0.40 * scale;
  const invSqrt2 = Math.SQRT1_2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const base = mix(top, bottom, y / size);
      // Q shape
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ring = r >= rInner && r <= rOuter;
      const t = (dx + dy) * invSqrt2;       // along the diagonal (down-right)
      const p = (dx - dy) * invSqrt2;       // perpendicular
      const tail = t >= tMin && t <= tMax && Math.abs(p) <= halfW;
      const fg = ring || tail;
      const col = fg ? [255, 255, 255] : base;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }]
];

for (const [name, size, opts] of targets) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, makeIcon(size, opts));
  console.log(`wrote ${file} (${size}x${size})`);
}
