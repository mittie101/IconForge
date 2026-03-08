# IconForge

> Convert any image to a professional multi-size Windows .ico file — locally, instantly, no watermarks.

IconForge is a lightweight Windows desktop app that converts PNG, JPG, WEBP, or BMP images into properly structured 32-bit `.ico` files. Drop an image, get a bundled multi-size icon (256, 128, 64, 48, 32, 16 px) ready for Windows apps, shortcuts, and installers — all processed locally with no uploads, no watermarks, and no browser limitations.

Built with Electron and sharp. Exports a single bundled `.ico`, individual per-size `.ico` files, or a ZIP of all sizes. Supports drag-and-drop, file browse, and clipboard paste.

## Features

- Drag-and-drop, click-to-browse, or Ctrl+V clipboard paste
- Auto square-crops non-square images to centre
- Exports all 6 standard Windows icon sizes: 256, 128, 64, 48, 32, 16 px
- Primary export: single bundled `.ico` (all sizes in one file)
- Secondary export: ZIP of 6 individual `.ico` files
- Per-size individual save from preview tiles
- 32-bit RGBA throughout — transparency preserved
- Lanczos3 resampling with progressive downscaling for best quality
- No internet connection required — fully local processing

## Installation

Download the latest installer from the [Releases](../../releases) page and run `IconForge-Setup.exe`.

## Development

```bash
npm install
npm start        # launch in dev mode
npm test         # run Jest tests
npm run build    # package to dist/ as Windows NSIS installer
```

Requires Node.js and Git for Windows. Native dependencies (sharp) are automatically rebuilt for Electron on `npm install`.

## Tech Stack

| Layer | Library |
|---|---|
| Platform | Electron |
| UI | Vanilla HTML/CSS/JS |
| Image processing | sharp (Lanczos3) |
| ZIP export | archiver |
| Installer | electron-builder (NSIS) |

## License

MIT © [Antony Morrison](https://github.com/) — Walking Fish Software
