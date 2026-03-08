'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZES       = [256, 128, 64, 48, 32, 16];
const VALID_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);
const VALID_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);

// Display size for each tile (minimum 64 px for small icons)
const DISPLAY = { 256: 96, 128: 96, 64: 64, 48: 64, 32: 64, 16: 64 };

// ─── State ────────────────────────────────────────────────────────────────────

let currentBasename = null;
let isProcessing    = false;

// ─── DOM refs ────────────────────────────────────────────────────────────────

const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const browseBtn     = document.getElementById('browse-btn');
const sourceBar     = document.getElementById('source-bar');
const sourceImg     = document.getElementById('source-img');
const sourceName    = document.getElementById('source-name');
const sourceDims    = document.getElementById('source-dims');
const cropNotice    = document.getElementById('crop-notice');
const outputSection = document.getElementById('output-section');
const tilesEl       = document.getElementById('tiles');
const saveBundleBtn = document.getElementById('save-bundle-btn');
const saveZipBtn    = document.getElementById('save-zip-btn');
const bundleLabel   = document.getElementById('bundle-label');
const toastEl       = document.getElementById('toast');

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, type = 'error') {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = `toast ${type}`;
  toastTimer = setTimeout(() => { toastEl.className = 'toast hidden'; }, 3200);
}

// ─── File validation ──────────────────────────────────────────────────────────

function isValidImage(file) {
  if (VALID_TYPES.has(file.type)) return true;
  const dot = file.name.lastIndexOf('.');
  return dot !== -1 && VALID_EXTS.has(file.name.slice(dot).toLowerCase());
}

// ─── Core: process a file ────────────────────────────────────────────────────

async function handleFile(filePath, filename) {
  if (isProcessing) return;
  isProcessing = true;
  dropZone.classList.add('processing');
  dropZone.querySelector('.drop-primary').textContent = 'Processing…';

  const result = await window.iconAPI.process(filePath, filename);

  isProcessing = false;
  dropZone.classList.remove('processing');
  dropZone.querySelector('.drop-primary').textContent = 'Drop an image here';

  if (result.error) {
    showToast(result.error);
    return;
  }

  const { previews, basename, origWidth, origHeight, wasCropped } = result;
  currentBasename = basename;

  // Source bar
  sourceImg.src          = previews[0];
  sourceName.textContent = filename;
  sourceDims.textContent = `${origWidth} × ${origHeight} px`;
  cropNotice.classList.toggle('hidden', !wasCropped);
  sourceBar.classList.remove('hidden');

  // Tiles
  tilesEl.innerHTML = '';
  SIZES.forEach((size, i) => tilesEl.appendChild(buildTile(size, previews[i])));

  // Action buttons
  bundleLabel.textContent = basename;
  saveBundleBtn.disabled  = false;
  saveZipBtn.disabled     = false;
  outputSection.classList.remove('hidden');
}

// ─── Build a preview tile ────────────────────────────────────────────────────

function buildTile(size, previewUrl) {
  const displayPx = DISPLAY[size];

  const tile = document.createElement('div');
  tile.className = 'tile';

  const label = document.createElement('div');
  label.className   = 'tile-label';
  label.textContent = `${size}×${size}`;

  const canvas = document.createElement('div');
  canvas.className = `tile-canvas tile-canvas-${displayPx}`;

  const img = document.createElement('img');
  img.src       = previewUrl;
  img.alt       = `${size}×${size} preview`;
  img.className = `tile-img-${displayPx}${size <= 32 ? ' pixelated' : ''}`;

  canvas.appendChild(img);

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'tile-save-btn';
  saveBtn.textContent = 'Save .ico';
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    const r = await window.iconAPI.saveIndividual(currentBasename, size);
    saveBtn.disabled = false;
    if (r.error) showToast(r.error);
  });

  tile.appendChild(label);
  tile.appendChild(canvas);
  tile.appendChild(saveBtn);
  return tile;
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!isValidImage(file)) {
    showToast('Please drop a valid image file (PNG, JPG, WEBP, BMP)');
    return;
  }
  handleFile(window.iconAPI.getFilePath(file), file.name);
});

dropZone.addEventListener('click', (e) => {
  if (e.target !== browseBtn) fileInput.click();
});

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!isValidImage(file)) {
    showToast('Please drop a valid image file (PNG, JPG, WEBP, BMP)');
    fileInput.value = '';
    return;
  }
  handleFile(window.iconAPI.getFilePath(file), file.name);
  fileInput.value = ''; // allow re-selecting the same file
});

// ─── Clipboard paste ──────────────────────────────────────────────────────────

document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    if (isProcessing) return;
    const r = await window.iconAPI.paste();
    if (r.error) {
      showToast(r.error);
      return;
    }
    await handleFile(r.filePath, r.filename);
  }
});

// ─── Export buttons ───────────────────────────────────────────────────────────

saveBundleBtn.addEventListener('click', async () => {
  if (!currentBasename || saveBundleBtn.disabled) return;
  saveBundleBtn.disabled = true;
  const r = await window.iconAPI.saveBundle(currentBasename);
  saveBundleBtn.disabled = false;
  if (r.error) showToast(r.error);
});

saveZipBtn.addEventListener('click', async () => {
  if (!currentBasename || saveZipBtn.disabled) return;
  saveZipBtn.disabled = true;
  const r = await window.iconAPI.saveZip(currentBasename);
  saveZipBtn.disabled = false;
  if (r.error) showToast(r.error);
});
