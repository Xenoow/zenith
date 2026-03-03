/**
 * Génère assets/icon.png et assets/icon.ico
 * Icône : fond sombre (#0e1016) + lettre Z en indigo (#6366f1) + coins arrondis
 * Ne nécessite aucune dépendance externe.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── Couleurs ──
const BG = [0x0e, 0x10, 0x16]; // sidebar dark
const FG = [0x63, 0x66, 0xf1]; // indigo accent

// ── Générateur PNG RGBA ───────────────────────────────────────────────────
function createPNG(size) {
  // CRC32
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

  // Dessin pixel par pixel (coordonnées normalisées sur 256)
  const rows = [];
  const S = 256; // espace de référence
  const RADIUS = 40; // rayon coins arrondis

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filtre PNG: None
    for (let x = 0; x < size; x++) {
      const px = (x / size) * S; // coordonnée normalisée
      const py = (y / size) * S;

      // Coins arrondis (alpha 0 hors du rect arrondi)
      let alpha = 255;
      const corners = [
        [RADIUS, RADIUS], [S - RADIUS, RADIUS],
        [RADIUS, S - RADIUS], [S - RADIUS, S - RADIUS],
      ];
      for (const [cx, cy] of corners) {
        if (px < cx && py < cy && (px - cx) ** 2 + (py - cy) ** 2 > RADIUS ** 2) {
          alpha = 0; break;
        }
        if (px > S - RADIUS && px < cx && py < cy && (px - cx) ** 2 + (py - cy) ** 2 > RADIUS ** 2) {
          alpha = 0; break;
        }
      }
      // Réutilise un check plus simple
      const inTL = px < RADIUS && py < RADIUS;
      const inTR = px > S-RADIUS && py < RADIUS;
      const inBL = px < RADIUS && py > S-RADIUS;
      const inBR = px > S-RADIUS && py > S-RADIUS;
      if (inTL && (px-RADIUS)**2+(py-RADIUS)**2 > RADIUS**2) alpha = 0;
      if (inTR && (px-(S-RADIUS))**2+(py-RADIUS)**2 > RADIUS**2) alpha = 0;
      if (inBL && (px-RADIUS)**2+(py-(S-RADIUS))**2 > RADIUS**2) alpha = 0;
      if (inBR && (px-(S-RADIUS))**2+(py-(S-RADIUS))**2 > RADIUS**2) alpha = 0;

      // Lettre Z
      const THICK = 22;
      const L = 62, R = 194, T = 58, B = 198;
      const isTop  = py >= T      && py <= T + THICK && px >= L && px <= R;
      const isBot  = py >= B-THICK && py <= B         && px >= L && px <= R;
      // Diagonale : de (R, T+THICK) à (L, B-THICK)
      const tDiag  = (px - R) / (L - R);
      const yDiag  = (T + THICK) + tDiag * ((B - THICK) - (T + THICK));
      const isDiag = px >= L && px <= R && Math.abs(py - yDiag) <= THICK * 0.85;

      let r, g, b;
      if ((isTop || isBot || isDiag) && alpha > 0) {
        [r, g, b] = FG;
      } else {
        [r, g, b] = BG;
      }

      const i = 1 + x * 4;
      row[i] = r; row[i+1] = g; row[i+2] = b; row[i+3] = alpha;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth=8, color type=RGBA

  const sig        = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const compressed = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── Assembleur ICO (PNG-in-ICO, Windows Vista+) ───────────────────────────
function buildICO(pngs) {
  // pngs = array of { png, size }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // reserved
  header.writeUInt16LE(1, 2);           // type: 1 = ICO
  header.writeUInt16LE(pngs.length, 4); // count

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ png, size }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 0 = 256
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;            // colors, reserved
    e.writeUInt16LE(1,  4);        // planes
    e.writeUInt16LE(32, 6);        // bit count
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs.map(p => p.png)]);
}

// ── Main ──────────────────────────────────────────────────────────────────
const outDir   = path.join(__dirname, '..', 'assets');
const sourcePng = path.join(outDir, 'icon-source.png');
fs.mkdirSync(outDir, { recursive: true });

// Si un PNG personnalisé existe, on l'utilise directement
if (fs.existsSync(sourcePng)) {
  console.log('Logo personnalisé détecté (icon-source.png)…');
  const png = fs.readFileSync(sourcePng);
  // Copie comme icon.png
  fs.writeFileSync(path.join(outDir, 'icon.png'), png);
  console.log('  icon.png… OK');
  // Crée l'ICO en embarquant le PNG (PNG-in-ICO, Windows Vista+)
  const ico = buildICO([{ png, size: 256 }]);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  console.log('  icon.ico… OK');
  console.log('\n✅ Icônes générées depuis icon-source.png :');
  console.log('   assets/icon.png  (' + png.length + ' octets)');
  console.log('   assets/icon.ico  (' + ico.length + ' octets)');
} else {
  // Génération automatique du Z Zenith
  console.log('Génération des icônes…');
  const sizes = [256, 64, 32, 16];
  const pngs  = sizes.map(s => { process.stdout.write(`  PNG ${s}x${s}… `); const png = createPNG(s); console.log('OK'); return { png, size: s }; });
  fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0].png);
  const ico = buildICO(pngs);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  console.log('\n✅ Icônes générées :');
  console.log('   assets/icon.png  (' + pngs[0].png.length + ' octets)');
  console.log('   assets/icon.ico  (' + ico.length + ' octets)');
}
