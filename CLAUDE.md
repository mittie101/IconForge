# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies (run after cloning)
npm start            # Launch Electron app in dev mode
npm run build        # Package → dist/ as Windows NSIS installer via electron-builder
npm run lint         # ESLint (if configured)
```

No automated test runner is set up. ICO output **must** be validated manually in Windows Explorer and a resource editor (e.g. Resource Hacker) before considering the ICO writer done.

## Project Overview

Single-window Electron app: drop/paste an image → get a multi-size `.ico` file for Windows.

- **Main process** (`main.js`): all image processing (sharp), file I/O, IPC handlers
- **Renderer process** (`renderer/`): vanilla HTML/CSS/JS UI — no Node access, communicates only via `contextBridge`
- **Preload** (`preload.js`): exposes IPC bridge to renderer via `contextBridge`

## Architecture

### Process boundary
All file I/O and image processing lives in the **main process only**. The renderer never touches the filesystem. `nodeIntegration` must stay disabled.

### IPC flow
| Channel              | Direction       | Payload                                      |
|----------------------|-----------------|----------------------------------------------|
| `icon:process`       | renderer → main | `{ filePath, filename }`                     |
| `icon:process-reply` | main → renderer | `{ previews: base64[5], basename }`          |
| `icon:paste`         | renderer → main | `{}`                                         |
| `icon:paste-reply`   | main → renderer | `{ filePath, filename }` or `{ error }`      |
| `icon:save-bundle`   | renderer → main | `{ basename }`                               |
| `icon:save-individual` | renderer → main | `{ basename, size }`                       |
| `icon:save-zip`      | renderer → main | `{ basename }`                               |
| `icon:save-reply`    | main → renderer | `{ success, savedPath?, error? }`            |

### In-memory session state (main process)
| Field            | Type        | Notes                                      |
|------------------|-------------|--------------------------------------------|
| `sourceFilePath` | `string`    | Absolute path of loaded file               |
| `basename`       | `string`    | Filename without extension                 |
| `resizedBuffers` | `Buffer[5]` | PNG buffers per size (256/128/64/32/16)    |
| `icoBuffers`     | `Buffer[5]` | Individual ICO binary per size             |
| `bundledIcoBuf`  | `Buffer`    | Single multi-size ICO (primary export)     |

State is cleared when a new image is loaded. No persistence between sessions.

### Image processing (sharp)
- Kernel: `lanczos3` on all resize operations
- Progressive downscaling: halve repeatedly until within ~2× of target, then final pass to exact size
- All intermediate buffers stay as PNG to avoid lossy compression between passes
- Square-crop to center if source is not square (before resizing)

## ICO Binary Format — CRITICAL

This is the highest-risk component. Byte-perfect output is required or Windows Explorer rejects the file.

- **16 / 32 / 64 / 128 px**: raw BMP inside ICO — `BITMAPINFOHEADER` + XOR pixel data + AND mask
  - `BITMAPINFOHEADER.biHeight` = **doubled** (XOR height + AND mask height combined)
  - 32-bit RGBA, no palette
  - AND mask rows must be DWORD-aligned
- **256 px**: PNG blob embedded directly in the ICO container (modern Windows ICO spec)
- Validate with Windows Explorer thumbnail rendering **and** a resource editor before shipping

## Error Handling

| Scenario                 | Message shown to user                                   |
|--------------------------|---------------------------------------------------------|
| Non-image file dropped   | "Please drop a valid image file (PNG, JPG, WEBP, BMP)" |
| Image too small (< 16px) | "Image too small — minimum 16×16px"                    |
| sharp decode failure     | "Could not read image. Try a different file."           |
| Save dialog cancelled    | Silent — no toast                                       |
| ZIP generation fails     | "Export failed. Try saving individually."               |
| Clipboard paste no image | "No image found on clipboard."                          |
| ICO write failure        | "Failed to generate .ico file."                         |

## Output Filenames
- Individual: `{basename}-256.ico`, `{basename}-128.ico`, `{basename}-64.ico`, `{basename}-32.ico`, `{basename}-16.ico`
- Bundled: `{basename}.ico`
- ZIP: `{basename}-icons.zip` containing the 5 individual ICOs
