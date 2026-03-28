'use strict';

// https://stackoverflow.com/a/43808972/7979

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
let fontkit;
try {
  fontkit = require('fontkit');
} catch (err) {
  console.error(
    'Missing dependency: fontkit. Install with `npm install fontkit` ' +
      'or run with NODE_PATH pointing to a fontkit install.'
  );
  process.exit(1);
}

const SCRIPT_DIR = __dirname;
const WF_DIR = path.resolve(SCRIPT_DIR, '..');
const ICONS_DIR = `${WF_DIR}/assets/apple_icons`;
const SWIFT_RENDERER = `${SCRIPT_DIR}/render_emoji_icons.swift`;
const MAPPING_FILE = `${SCRIPT_DIR}/emoji-to-icon-filename.json`;

function ensureDir(pathname) {
  if (!fs.existsSync(pathname)) {
    fs.mkdirSync(pathname, { recursive: true });
  }
}

function clearPngs(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith('.png')) {
      fs.unlinkSync(path.join(dir, entry));
    }
  }
}

function renderWithSwift(batch) {
  if (batch.length === 0) {
    return;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'famos-apple-icons-'));
  const batchFile = path.join(tempDir, 'emoji-icon-batch.json');

  try {
    fs.writeFileSync(batchFile, JSON.stringify(batch), 'utf8');
    const result = spawnSync(
      'swift',
      [SWIFT_RENDERER, batchFile, '64', ICONS_DIR],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          SWIFT_MODULECACHE_PATH:
            process.env.SWIFT_MODULECACHE_PATH || '/tmp/swift-module-cache',
          CLANG_MODULE_CACHE_PATH:
            process.env.CLANG_MODULE_CACHE_PATH || '/tmp/clang-module-cache',
        }
      }
    );
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function isPngBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

function renderWithFontkit(emojiToIconMap) {
  const fontPath = '/System/Library/Fonts/Apple Color Emoji.ttc';
  const font = fontkit.openSync(fontPath).fonts[0];
  const fallbackBatch = [];

  let directCount = 0;

  for (const [emoji, filename] of Object.entries(emojiToIconMap)) {
    const outputPath = path.join(ICONS_DIR, filename);

    const layout = font.layout(emoji);
    const glyphs = layout.glyphs || [];
    const first = glyphs[0];

    // Keep the original high-quality extraction path whenever the sequence
    // resolves to a single PNG glyph. Fallback handles known problematic
    // sequences (flip / multi-glyph / null image).
    if (glyphs.length === 1 && first) {
      const img = first.getImageForSize(64);
      if (img !== null && isPngBuffer(img.data)) {
        fs.writeFileSync(outputPath, img.data);
        directCount += 1;
        continue;
      }
    }

    fallbackBatch.push({ emoji, filename });
  }

  return { directCount, fallbackBatch };
}

const emojiToIconMap = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));

ensureDir(ICONS_DIR);
clearPngs(ICONS_DIR);
const { directCount, fallbackBatch } = renderWithFontkit(emojiToIconMap);
renderWithSwift(fallbackBatch);

const totalCount = Object.keys(emojiToIconMap).length;
console.log(
  `Generated ${totalCount} icons in ${ICONS_DIR} ` +
    `(fontkit=${directCount}, swift-fallback=${fallbackBatch.length})`
);
