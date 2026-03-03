/**
 * Génère assets/icon.png et assets/icon.ico
 * Si assets/icon-source.png existe, il est décodé et redimensionné pour chaque
 * taille ICO (256/48/32/16) ; sinon génère le logo Z Zenith automatiquement.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Couleurs logo Z ──
const BG = [0x0e, 0x10, 0x16];
const FG = [0x63, 0x66, 0xf1];

// ── Helpers PNG partagés ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td  = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, getPixel) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // filtre: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const i = 1 + x * 4;
      row[i] = r; row[i+1] = g; row[i+2] = b; row[i+3] = a;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth=8, RGBA
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const compressed = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── Décodeur PNG → pixels RGBA 8-bit ─────────────────────────────────────
function decodePNG(buf) {
  let pos = 8; // skip signature
  let width, height, colorType, bitDepth;
  const idatChunks = [];
  let palette = null;

  while (pos < buf.length) {
    const len  = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len + 4; // +4 pour CRC

    if      (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'PLTE') { palette = data; }
    else if (type === 'IDAT') { idatChunks.push(data); }
    else if (type === 'IEND') { break; }
  }

  // Nombre de canaux selon colorType (0=Gray, 2=RGB, 3=Indexed, 4=GrayA, 6=RGBA)
  const channels = [1, 0, 3, 1, 2, 0, 4][colorType];
  const bpp    = Math.ceil(channels * bitDepth / 8);
  const stride = width * bpp;
  const raw    = zlib.inflateSync(Buffer.concat(idatChunks));

  // Reconstruction des filtres PNG
  const recon = [];
  let prevRow = Buffer.alloc(stride, 0);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const srcOff = y * (stride + 1) + 1;
    const row = Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const rb     = raw[srcOff + x];
      const left   = x >= bpp ? row[x - bpp]    : 0;
      const up     = prevRow[x];
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0;
      let val;
      if      (filterType === 0) val = rb;
      else if (filterType === 1) val = rb + left;
      else if (filterType === 2) val = rb + up;
      else if (filterType === 3) val = rb + Math.floor((left + up) / 2);
      else { // Paeth
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        val = rb + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      row[x] = val & 0xFF;
    }
    recon.push(row);
    prevRow = row;
  }

  // Conversion vers RGBA 8-bit
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = recon[y];
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if      (colorType === 6) { pixels[di]=row[x*4]; pixels[di+1]=row[x*4+1]; pixels[di+2]=row[x*4+2]; pixels[di+3]=row[x*4+3]; }
      else if (colorType === 2) { pixels[di]=row[x*3]; pixels[di+1]=row[x*3+1]; pixels[di+2]=row[x*3+2]; pixels[di+3]=255; }
      else if (colorType === 0) { pixels[di]=pixels[di+1]=pixels[di+2]=row[x]; pixels[di+3]=255; }
      else if (colorType === 4) { pixels[di]=pixels[di+1]=pixels[di+2]=row[x*2]; pixels[di+3]=row[x*2+1]; }
      else if (colorType === 3 && palette) {
        const idx = row[x];
        pixels[di]=palette[idx*3]; pixels[di+1]=palette[idx*3+1]; pixels[di+2]=palette[idx*3+2]; pixels[di+3]=255;
      }
    }
  }
  return { width, height, pixels };
}

// ── Redimensionneur par filtre de boîte (meilleur que nearest-neighbor) ──
function resizeRGBA(src, srcW, srcH, dstW, dstH) {
  const dst    = Buffer.alloc(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const x0 = x * scaleX, x1 = (x + 1) * scaleX;
      const y0 = y * scaleY, y1 = (y + 1) * scaleY;
      let r = 0, g = 0, b = 0, a = 0, w = 0;

      for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < srcH; sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < srcW; sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
          const ww = wx * wy;
          const si = (sy * srcW + sx) * 4;
          r += src[si]   * ww;
          g += src[si+1] * ww;
          b += src[si+2] * ww;
          a += src[si+3] * ww;
          w += ww;
        }
      }

      const di = (y * dstW + x) * 4;
      dst[di]   = Math.round(r / w);
      dst[di+1] = Math.round(g / w);
      dst[di+2] = Math.round(b / w);
      dst[di+3] = Math.round(a / w);
    }
  }
  return dst;
}

// ── Logo Z Zenith (généré pixel par pixel) ────────────────────────────────
function createZPNG(size) {
  const S = 256, RADIUS = 40;
  return encodePNG(size, size, (x, y) => {
    const px = (x / size) * S;
    const py = (y / size) * S;

    let alpha = 255;
    const inTL = px < RADIUS && py < RADIUS;
    const inTR = px > S-RADIUS && py < RADIUS;
    const inBL = px < RADIUS && py > S-RADIUS;
    const inBR = px > S-RADIUS && py > S-RADIUS;
    if (inTL && (px-RADIUS)**2+(py-RADIUS)**2 > RADIUS**2) alpha = 0;
    if (inTR && (px-(S-RADIUS))**2+(py-RADIUS)**2 > RADIUS**2) alpha = 0;
    if (inBL && (px-RADIUS)**2+(py-(S-RADIUS))**2 > RADIUS**2) alpha = 0;
    if (inBR && (px-(S-RADIUS))**2+(py-(S-RADIUS))**2 > RADIUS**2) alpha = 0;

    const THICK = 22, L = 62, R = 194, T = 58, B = 198;
    const isTop  = py >= T       && py <= T+THICK && px >= L && px <= R;
    const isBot  = py >= B-THICK && py <= B       && px >= L && px <= R;
    const tDiag  = (px - R) / (L - R);
    const yDiag  = (T+THICK) + tDiag * ((B-THICK) - (T+THICK));
    const isDiag = px >= L && px <= R && Math.abs(py - yDiag) <= THICK * 0.85;

    const [r, g, b] = (isTop || isBot || isDiag) && alpha > 0 ? FG : BG;
    return [r, g, b, alpha];
  });
}

// ── Assembleur ICO (PNG-in-ICO, Windows Vista+) ───────────────────────────
function buildICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ png, size }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1,  4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs.map(p => p.png)]);
}

// ── Main ──────────────────────────────────────────────────────────────────
const outDir    = path.join(__dirname, '..', 'assets');
const sourcePng = path.join(outDir, 'icon-source.png');
fs.mkdirSync(outDir, { recursive: true });

console.log('Génération des icônes…');
const sizes = [256, 48, 32, 16];
let pngs;

if (fs.existsSync(sourcePng)) {
  console.log('  Logo personnalisé détecté → décodage et redimensionnement…');
  const { width, height, pixels } = decodePNG(fs.readFileSync(sourcePng));
  console.log(`  Source : ${width}x${height}px`);
  pngs = sizes.map(s => {
    process.stdout.write(`  PNG ${s}x${s}… `);
    const resized = resizeRGBA(pixels, width, height, s, s);
    const png = encodePNG(s, s, (x, y) => {
      const i = (y * s + x) * 4;
      return [resized[i], resized[i+1], resized[i+2], resized[i+3]];
    });
    console.log('OK');
    return { png, size: s };
  });
} else {
  pngs = sizes.map(s => {
    process.stdout.write(`  PNG ${s}x${s}… `);
    const png = createZPNG(s);
    console.log('OK');
    return { png, size: s };
  });
}

fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0].png);
const ico = buildICO(pngs);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log('\n✅ Icônes générées :');
console.log('   assets/icon.png  (' + pngs[0].png.length + ' octets)');
console.log('   assets/icon.ico  (' + ico.length + ' octets)');
