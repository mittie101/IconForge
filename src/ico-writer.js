'use strict';

/**
 * Build the BMP image-data block used inside an ICO entry for sizes < 256.
 * Layout: BITMAPINFOHEADER (40 B) + XOR pixel data (BGRA, bottom-up) + AND mask
 * @param {Buffer} rgbaBuffer  Raw RGBA pixels, top-down row order, size×size
 * @param {number} size
 * @returns {Buffer}
 */
function buildBmpData(rgbaBuffer, size) {
  // DWORD-aligned row width for the 1-bpp AND mask
  const andRowBytes = Math.ceil(size / 32) * 4;

  // BITMAPINFOHEADER — 40 bytes
  const header = Buffer.alloc(40, 0);
  header.writeUInt32LE(40,       0);   // biSize
  header.writeInt32LE (size,     4);   // biWidth
  header.writeInt32LE (size * 2, 8);   // biHeight — doubled (XOR + AND combined)
  header.writeUInt16LE(1,        12);  // biPlanes
  header.writeUInt16LE(32,       14);  // biBitCount
  // biCompression … biClrImportant = 0 (already zeroed)

  // XOR pixel data — BGRA, bottom-up
  const xorData = Buffer.alloc(size * size * 4);
  for (let bmpRow = 0; bmpRow < size; bmpRow++) {
    const srcRow = size - 1 - bmpRow;          // flip: BMP stores rows bottom-up
    for (let x = 0; x < size; x++) {
      const srcOff = (srcRow * size + x) * 4;
      const dstOff = (bmpRow * size + x) * 4;
      xorData[dstOff + 0] = rgbaBuffer[srcOff + 2]; // B
      xorData[dstOff + 1] = rgbaBuffer[srcOff + 1]; // G
      xorData[dstOff + 2] = rgbaBuffer[srcOff + 0]; // R
      xorData[dstOff + 3] = rgbaBuffer[srcOff + 3]; // A
    }
  }

  // AND mask — 1 bpp, bottom-up, DWORD-aligned rows
  // Bit = 1 → transparent (alpha == 0), bit = 0 → opaque
  const andData = Buffer.alloc(andRowBytes * size, 0);
  for (let bmpRow = 0; bmpRow < size; bmpRow++) {
    const srcRow = size - 1 - bmpRow;
    for (let x = 0; x < size; x++) {
      const alpha = rgbaBuffer[(srcRow * size + x) * 4 + 3];
      if (alpha === 0) {
        const byteIdx  = bmpRow * andRowBytes + Math.floor(x / 8);
        const bitShift = 7 - (x % 8);   // MSB first within each byte
        andData[byteIdx] |= (1 << bitShift);
      }
    }
  }

  return Buffer.concat([header, xorData, andData]);
}

/**
 * Wrap one image-data block in a minimal single-entry ICO container.
 * @param {Buffer} imageData  BMP data block or raw PNG buffer
 * @param {number} size
 * @returns {Buffer}
 */
function buildSingleIco(imageData, size) {
  const iconDir = Buffer.alloc(6, 0);
  iconDir.writeUInt16LE(0, 0);  // Reserved
  iconDir.writeUInt16LE(1, 2);  // Type = ICO
  iconDir.writeUInt16LE(1, 4);  // Count = 1

  const w = size === 256 ? 0 : size;   // Width byte — 0 encodes 256
  const entry = Buffer.alloc(16, 0);
  entry.writeUInt8   (w,                0);   // Width
  entry.writeUInt8   (w,                1);   // Height
  entry.writeUInt8   (0,                2);   // ColorCount (32-bit = 0)
  entry.writeUInt8   (0,                3);   // Reserved
  entry.writeUInt16LE(1,                4);   // Planes
  entry.writeUInt16LE(32,               6);   // BitCount
  entry.writeUInt32LE(imageData.length, 8);   // BytesInRes
  entry.writeUInt32LE(22,               12);  // ImageOffset (6 + 16 = 22)

  return Buffer.concat([iconDir, entry, imageData]);
}

/**
 * Build a multi-size bundled ICO from an array of image-data blocks.
 * @param {Buffer[]} blocks  One block per size (BMP or PNG)
 * @param {number[]} sizes   Corresponding size values
 * @returns {Buffer}
 */
function buildBundledIco(blocks, sizes) {
  const count = blocks.length;

  const iconDir = Buffer.alloc(6, 0);
  iconDir.writeUInt16LE(0,     0);
  iconDir.writeUInt16LE(1,     2);
  iconDir.writeUInt16LE(count, 4);

  // Data area begins after ICONDIR + all ICONDIRENTRYs
  let offset = 6 + count * 16;
  const entries = Buffer.alloc(count * 16, 0);

  for (let i = 0; i < count; i++) {
    const w    = sizes[i] === 256 ? 0 : sizes[i];
    const base = i * 16;
    entries.writeUInt8   (w,               base);
    entries.writeUInt8   (w,               base + 1);
    entries.writeUInt8   (0,               base + 2);
    entries.writeUInt8   (0,               base + 3);
    entries.writeUInt16LE(1,               base + 4);
    entries.writeUInt16LE(32,              base + 6);
    entries.writeUInt32LE(blocks[i].length, base + 8);
    entries.writeUInt32LE(offset,          base + 12);
    offset += blocks[i].length;
  }

  return Buffer.concat([iconDir, entries, ...blocks]);
}

module.exports = { buildBmpData, buildSingleIco, buildBundledIco };
