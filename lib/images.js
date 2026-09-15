const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const FULLS_DIR = path.join(ROOT, 'images', 'fulls');
const THUMBS_DIR = path.join(ROOT, 'images', 'thumbs');
const WEB_DIR = path.join(ROOT, 'images', 'web');

const WEB_MAX = 2400;
const THUMB_WIDTH = 720;

function ensureDirs() {
  for (const dir of [FULLS_DIR, THUMBS_DIR, WEB_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function webName(filename) {
  return path.parse(filename).name + '.jpg';
}

function thumbName(filename) {
  return path.parse(filename).name + '.jpg';
}

async function makeWeb(sourcePath, destName) {
  ensureDirs();
  const dest = path.join(WEB_DIR, destName);
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: WEB_MAX,
      height: WEB_MAX,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  return destName;
}

async function makeThumb(sourcePath, destName) {
  ensureDirs();
  const dest = path.join(THUMBS_DIR, destName);
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: THUMB_WIDTH,
      withoutEnlargement: true
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(dest);
  return destName;
}

async function processUpload(sourcePath, id) {
  const originalName = `${id}.jpg`;
  const originalPath = path.join(FULLS_DIR, originalName);
  await sharp(sourcePath)
    .rotate()
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(originalPath);

  const web = await makeWeb(originalPath, originalName);
  const thumb = await makeThumb(originalPath, originalName);
  return { original: originalName, web, thumb };
}

function removeFiles(photo) {
  const names = new Set([photo.original, photo.thumb, webName(photo.original)].filter(Boolean));
  for (const name of names) {
    for (const dir of [FULLS_DIR, THUMBS_DIR, WEB_DIR]) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }
}

async function ensureDerivatives(photos) {
  ensureDirs();
  for (const photo of photos) {
    const source = path.join(FULLS_DIR, photo.original);
    if (!fs.existsSync(source)) {
      continue;
    }
    const webFile = path.join(WEB_DIR, webName(photo.original));
    if (!fs.existsSync(webFile)) {
      await makeWeb(source, webName(photo.original));
    }
    const thumbFile = path.join(THUMBS_DIR, photo.thumb || thumbName(photo.original));
    if (!fs.existsSync(thumbFile)) {
      await makeThumb(source, path.basename(thumbFile));
    }
  }
}

function publicUrls(photo) {
  const web = webName(photo.original);
  const thumb = photo.thumb || thumbName(photo.original);
  return {
    full: `/images/web/${web}`,
    thumb: `/images/thumbs/${thumb}`,
    original: `/images/fulls/${photo.original}`
  };
}

module.exports = {
  FULLS_DIR,
  THUMBS_DIR,
  WEB_DIR,
  webName,
  processUpload,
  removeFiles,
  ensureDerivatives,
  publicUrls
};
