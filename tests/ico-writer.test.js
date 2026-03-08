'use strict';

const { buildBmpData, buildSingleIco, buildBundledIco } = require('../src/ico-writer');

const SIZES = [256, 128, 64, 48, 32, 16];

// ─── buildBmpData ─────────────────────────────────────────────────────────────

describe('buildBmpData', () => {
  const andRowBytes = (size) => Math.ceil(size / 32) * 4;
  const expectedLen = (size) => 40 + size * size * 4 + andRowBytes(size) * size;

  test.each([16, 32, 48, 64, 128])('produces correct buffer size for %dpx', (size) => {
    const buf = Buffer.alloc(size * size * 4, 0xff);
    expect(buildBmpData(buf, size).length).toBe(expectedLen(size));
  });

  test('BITMAPINFOHEADER fields are correct (32px)', () => {
    const buf = Buffer.alloc(32 * 32 * 4, 0xff);
    const result = buildBmpData(buf, 32);
    expect(result.readUInt32LE(0)).toBe(40);  // biSize
    expect(result.readInt32LE(4)).toBe(32);   // biWidth
    expect(result.readInt32LE(8)).toBe(64);   // biHeight — doubled
    expect(result.readUInt16LE(12)).toBe(1);  // biPlanes
    expect(result.readUInt16LE(14)).toBe(32); // biBitCount = 32-bit RGBA
    expect(result.readUInt32LE(16)).toBe(0);  // biCompression = BI_RGB
  });

  test('biHeight is doubled for all sizes', () => {
    for (const size of [16, 32, 48, 64, 128]) {
      const buf = Buffer.alloc(size * size * 4, 0xff);
      const result = buildBmpData(buf, size);
      expect(result.readInt32LE(8)).toBe(size * 2);
    }
  });

  test('BGRA channel swap applied — bottom-up row order', () => {
    const size = 16;
    const rgba = Buffer.alloc(size * size * 4, 0);
    // Set last source row (row 15), col 0 — becomes bmpRow 0, first XOR pixel
    const srcOff = (15 * size + 0) * 4;
    rgba[srcOff + 0] = 10;  // R
    rgba[srcOff + 1] = 20;  // G
    rgba[srcOff + 2] = 30;  // B
    rgba[srcOff + 3] = 255; // A
    const result = buildBmpData(rgba, size);
    const xorStart = 40;
    expect(result[xorStart + 0]).toBe(30);  // B
    expect(result[xorStart + 1]).toBe(20);  // G
    expect(result[xorStart + 2]).toBe(10);  // R
    expect(result[xorStart + 3]).toBe(255); // A
  });

  test('AND mask bit set (MSB-first) for fully transparent pixel', () => {
    const size = 16;
    const rgba = Buffer.alloc(size * size * 4, 0xff); // all opaque
    // Make source row 0, col 0 fully transparent
    rgba[3] = 0;
    const result = buildBmpData(rgba, size);
    const andStart = 40 + size * size * 4;
    const aRowBytes = andRowBytes(size);
    // Source row 0 → bmpRow = size-1 = 15
    const byteIdx = (size - 1) * aRowBytes + 0;
    expect(result[andStart + byteIdx] & 0x80).toBe(0x80); // bit 7 set (col 0, MSB first)
  });

  test('AND mask clear for fully opaque pixels', () => {
    const size = 16;
    const rgba = Buffer.alloc(size * size * 4, 0xff); // all alpha=255
    const result = buildBmpData(rgba, size);
    const andStart = 40 + size * size * 4;
    const andLen   = andRowBytes(size) * size;
    const andSlice = result.slice(andStart, andStart + andLen);
    expect(andSlice.every(b => b === 0)).toBe(true);
  });

  test('AND mask rows are DWORD-aligned', () => {
    for (const size of [16, 32, 48, 64, 128]) {
      expect(andRowBytes(size) % 4).toBe(0);
    }
  });
});

// ─── buildSingleIco ───────────────────────────────────────────────────────────

describe('buildSingleIco', () => {
  test('ICONDIR magic: Reserved=0, Type=1, Count=1', () => {
    const ico = buildSingleIco(Buffer.alloc(100), 32);
    expect(ico.readUInt16LE(0)).toBe(0); // Reserved
    expect(ico.readUInt16LE(2)).toBe(1); // Type = ICO
    expect(ico.readUInt16LE(4)).toBe(1); // Count
  });

  test('ImageOffset is 22 (6 ICONDIR + 16 ICONDIRENTRY)', () => {
    const ico = buildSingleIco(Buffer.alloc(100), 32);
    expect(ico.readUInt32LE(6 + 12)).toBe(22);
  });

  test('width/height bytes are 0 for 256px (ICO spec)', () => {
    const ico = buildSingleIco(Buffer.alloc(100), 256);
    expect(ico.readUInt8(6)).toBe(0);
    expect(ico.readUInt8(7)).toBe(0);
  });

  test('width/height bytes match size for non-256 sizes', () => {
    for (const size of [16, 32, 48, 64, 128]) {
      const ico = buildSingleIco(Buffer.alloc(100), size);
      expect(ico.readUInt8(6)).toBe(size);
      expect(ico.readUInt8(7)).toBe(size);
    }
  });

  test('BitCount is 32', () => {
    const ico = buildSingleIco(Buffer.alloc(100), 32);
    expect(ico.readUInt16LE(6 + 6)).toBe(32);
  });

  test('BytesInRes matches imageData length', () => {
    const data = Buffer.alloc(1234);
    const ico  = buildSingleIco(data, 32);
    expect(ico.readUInt32LE(6 + 8)).toBe(1234);
  });

  test('total length is 22 + imageData.length', () => {
    const data = Buffer.alloc(500);
    expect(buildSingleIco(data, 32).length).toBe(522);
  });

  test('image data is appended verbatim after directory', () => {
    const data = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
    const ico  = buildSingleIco(data, 32);
    expect(ico.slice(22)).toEqual(data);
  });
});

// ─── buildBundledIco ──────────────────────────────────────────────────────────

describe('buildBundledIco', () => {
  const makeBlocks = () => SIZES.map((_, i) => Buffer.alloc(100 + i * 10));

  test('Count field matches number of images', () => {
    const ico = buildBundledIco(makeBlocks(), SIZES);
    expect(ico.readUInt16LE(4)).toBe(SIZES.length);
  });

  test('first ImageOffset is 6 + count×16', () => {
    const ico = buildBundledIco(makeBlocks(), SIZES);
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + SIZES.length * 16);
  });

  test('ImageOffsets are sequential with no gaps', () => {
    const blocks = makeBlocks();
    const ico    = buildBundledIco(blocks, SIZES);
    let expectedOffset = 6 + SIZES.length * 16;
    for (let i = 0; i < SIZES.length; i++) {
      const base = 6 + i * 16;
      expect(ico.readUInt32LE(base + 12)).toBe(expectedOffset);
      expectedOffset += blocks[i].length;
    }
  });

  test('total length = header + entries + all block data', () => {
    const blocks   = makeBlocks();
    const dataSize = blocks.reduce((s, b) => s + b.length, 0);
    const ico      = buildBundledIco(blocks, SIZES);
    expect(ico.length).toBe(6 + SIZES.length * 16 + dataSize);
  });

  test('256px entry has width/height bytes of 0', () => {
    const ico = buildBundledIco(makeBlocks(), SIZES);
    // SIZES[0] = 256, first entry at offset 6
    expect(ico.readUInt8(6)).toBe(0);
    expect(ico.readUInt8(7)).toBe(0);
  });

  test('non-256 entries have correct width/height bytes', () => {
    const ico = buildBundledIco(makeBlocks(), SIZES);
    SIZES.forEach((size, i) => {
      const base = 6 + i * 16;
      const expected = size === 256 ? 0 : size;
      expect(ico.readUInt8(base)).toBe(expected);
      expect(ico.readUInt8(base + 1)).toBe(expected);
    });
  });
});
