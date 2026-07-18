// Generates build/icon.png (256x256) and build/icon.ico (PNG-embedded)
// without any dependencies: raw RGBA pixels -> zlib -> hand-built PNG chunks.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = Buffer.alloc(S * S * 4); // RGBA

// ---- helpers -------------------------------------------------------------
function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  // simple alpha-over blend
  const na = a / 255;
  px[i] = Math.round(r * na + px[i] * (1 - na));
  px[i + 1] = Math.round(g * na + px[i + 1] * (1 - na));
  px[i + 2] = Math.round(b * na + px[i + 2] * (1 - na));
  px[i + 3] = Math.max(px[i + 3], a);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// distance from point to segment
function segDist(px_, py_, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px_ - x1) * dx + (py_ - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px_ - cx, py_ - cy);
}

// rounded-rect signed distance (negative = inside)
function rrectDist(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// ---- draw ----------------------------------------------------------------
// background tile: rounded square, diagonal gradient #8b5cf6 -> #6d28d9
const cA = [139, 92, 246], cB = [109, 40, 217];
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = rrectDist(x + 0.5, y + 0.5, S / 2, S / 2, 118, 118, 56);
    if (d < 0.5) {
      const t = (x + y) / (2 * S);
      const aa = d < -0.5 ? 255 : Math.round(255 * (0.5 - d)); // 1px edge AA
      setPx(x, y, lerp(cA[0], cB[0], t), lerp(cA[1], cB[1], t), lerp(cA[2], cB[2], t), aa);
    }
  }
}

// subtle top highlight
for (let y = 14; y < 110; y++) {
  for (let x = 0; x < S; x++) {
    const d = rrectDist(x + 0.5, y + 0.5, S / 2, S / 2, 118, 118, 56);
    if (d < -2) {
      const f = 1 - (y - 14) / 96;
      setPx(x, y, 255, 255, 255, Math.round(18 * f));
    }
  }
}

// white "K": vertical bar + two diagonal strokes with rounded caps
const strokes = [
  [86, 66, 86, 190],    // vertical bar
  [92, 130, 172, 66],   // upper diagonal
  [92, 130, 172, 190],  // lower diagonal
];
const W = 17; // half stroke width
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let dmin = 1e9;
    for (const [x1, y1, x2, y2] of strokes) {
      dmin = Math.min(dmin, segDist(x + 0.5, y + 0.5, x1, y1, x2, y2));
    }
    const d = dmin - W;
    if (d < 0.5) {
      const aa = d < -0.5 ? 255 : Math.round(255 * (0.5 - d));
      setPx(x, y, 255, 255, 255, aa);
    }
  }
}

// ---- encode PNG ----------------------------------------------------------
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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ---- wrap in ICO (single PNG-compressed 256px entry) ---------------------
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0);       // reserved
ico.writeUInt16LE(1, 2);       // type: icon
ico.writeUInt16LE(1, 4);       // count
ico[6] = 0;                    // width 256
ico[7] = 0;                    // height 256
ico[8] = 0;                    // palette
ico[9] = 0;                    // reserved
ico.writeUInt16LE(1, 10);      // planes
ico.writeUInt16LE(32, 12);     // bpp
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);     // offset

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png);
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([ico, png]));
console.log('icon.png + icon.ico written');
