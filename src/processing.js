'use strict';

const path = require('path');
const sharp = require('sharp');
const { buildBmpData, buildSingleIco, buildBundledIco } = require('./ico-writer');

const SIZES = [256, 128, 64, 48, 32, 16];

// Session state — cleared at the start of each processImageFile call
const state = {
  basename:       null,
  resizedBuffers: null,   // Buffer[6] — PNG per size, indices match SIZES
  icoBuffers:     null,   // Buffer[6] — single-size ICO per size
  bundledIcoBuf:  null,   // Buffer    — multi-size bundled ICO
};

/**
 * Halve the image repeatedly until within 2× of targetSize, then final resize.
 * All steps use Lanczos3 and PNG buffers to avoid lossy compression.
 */
async function progressiveResize(inputBuf, targetSize) {
  let buf = inputBuf;
  let { width } = await sharp(buf).metadata();

  while (width > targetSize * 2) {
    const next = Math.max(Math.floor(width / 2), targetSize);
    buf = await sharp(buf)
      .resize(next, next, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
      .png()
      .toBuffer();
    width = next;
  }

  return sharp(buf)
    .resize(targetSize, targetSize, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toBuffer();
}

/**
 * Full pipeline: decode → validate → square-crop → N sizes → ICO buffers.
 * Clears and repopulates module-level `state`; returns render data for the renderer.
 */
async function processImageFile(filePath, filename) {
  // Wipe state immediately so stale buffers can't be saved if this run fails
  state.basename = null;
  state.resizedBuffers = null;
  state.icoBuffers = null;
  state.bundledIcoBuf = null;

  const meta = await sharp(filePath).metadata();

  if (!meta.width || !meta.height) throw new Error('Could not read image. Try a different file.');
  if (meta.width < 16 || meta.height < 16) throw new Error('Image too small — minimum 16×16px');

  const origWidth  = meta.width;
  const origHeight = meta.height;
  const wasCropped = origWidth !== origHeight;

  // Square-crop to centre
  let pipeline = sharp(filePath).ensureAlpha();
  if (wasCropped) {
    const minDim = Math.min(origWidth, origHeight);
    pipeline = pipeline.extract({
      left:   Math.floor((origWidth  - minDim) / 2),
      top:    Math.floor((origHeight - minDim) / 2),
      width:  minDim,
      height: minDim,
    });
  }
  const squaredBuf = await pipeline.png().toBuffer();

  // Generate PNG buffers for each size
  const resizedBuffers = [];
  for (const size of SIZES) {
    resizedBuffers.push(await progressiveResize(squaredBuf, size));
  }

  // Build per-size image-data blocks and ICO wrappers
  const icoBlocks  = [];
  const icoBuffers = [];
  for (let i = 0; i < SIZES.length; i++) {
    const size   = SIZES[i];
    const pngBuf = resizedBuffers[i];
    let   block;

    if (size === 256) {
      // 256 px — embed raw PNG inside ICO (modern Windows spec)
      block = pngBuf;
    } else {
      // Smaller sizes — raw BMP DIB inside ICO
      const rawRgba = await sharp(pngBuf).ensureAlpha().raw().toBuffer();
      block = buildBmpData(rawRgba, size);
    }

    icoBlocks.push(block);
    icoBuffers.push(buildSingleIco(block, size));
  }

  const bundledIcoBuf = buildBundledIco(icoBlocks, SIZES);
  const basename      = path.basename(filename, path.extname(filename));

  // Commit to session state
  state.basename       = basename;
  state.resizedBuffers = resizedBuffers;
  state.icoBuffers     = icoBuffers;
  state.bundledIcoBuf  = bundledIcoBuf;

  return {
    previews:    resizedBuffers.map(b => 'data:image/png;base64,' + b.toString('base64')),
    basename,
    origWidth,
    origHeight,
    wasCropped,
  };
}

module.exports = { SIZES, state, processImageFile };
