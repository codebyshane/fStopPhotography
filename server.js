'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const store = require('./lib/store');
const images = require('./lib/images');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PATH = normalizeAdminPath(process.env.ADMIN_PATH || '/darkroom');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'studio';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'change-me-to-a-strong-password') {
  console.warn('Set a strong ADMIN_PASSWORD in .env before using the studio.');
}

const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex'), 10);

const upload = multer({
  dest: path.join(ROOT, 'data', 'tmp'),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const allowed = /^(image\/(jpeg|png|webp|gif|heic|heif))$/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Please upload a JPEG, PNG, WebP, or GIF image.'));
    }
  }
});

fs.mkdirSync(path.join(ROOT, 'data', 'tmp'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data', 'sessions'), { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'script-src': ["'self'"],
      'connect-src': ["'self'"],
      'upgrade-insecure-requests': null
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
  name: 'fstop.sid',
  secret: SESSION_SECRET,
  store: new FileStore({
    path: path.join(ROOT, 'data', 'sessions'),
    logFn: () => {},
    retries: 1
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use('/assets', express.static(path.join(ROOT, 'assets'), { maxAge: '7d' }));
app.use('/images/fulls', express.static(path.join(ROOT, 'images', 'fulls'), { maxAge: '7d' }));
app.use('/images/thumbs', express.static(path.join(ROOT, 'images', 'thumbs'), { maxAge: '7d' }));
app.use('/images/web', express.static(path.join(ROOT, 'images', 'web'), { maxAge: '7d' }));

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nDisallow: ' + ADMIN_PATH + '\nDisallow: /api/studio\n'
  );
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  const photos = store.list();
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderTemplate('gallery.html', {
    year: String(new Date().getFullYear()),
    count: String(photos.length),
    countLabel: photos.length === 1 ? 'Photograph' : 'Photographs',
    thumbnails: renderThumbnails(photos)
  }));
});

app.get('/api/photos', (_req, res) => {
  res.json({ photos: store.list().map(publicPhoto) });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many sign-in attempts. Please wait and try again.'
});

app.get(ADMIN_PATH, noIndex, (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.session && req.session.authenticated) {
    return res.type('html').send(renderTemplate('studio.html', {
      adminPath: ADMIN_PATH,
      username: escapeHtml(req.session.username || ADMIN_USERNAME)
    }));
  }
  return res.type('html').send(renderTemplate('login.html', {
    adminPath: ADMIN_PATH,
    error: ''
  }));
});

app.post(ADMIN_PATH + '/login', noIndex, loginLimiter, (req, res) => {
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  const userOk = timingSafeEqualString(username, ADMIN_USERNAME);
  const passOk = bcrypt.compareSync(password, passwordHash);

  if (!userOk || !passOk || !ADMIN_PASSWORD) {
    return res.status(401).type('html').send(renderTemplate('login.html', {
      adminPath: ADMIN_PATH,
      error: '<p class="form-error">Those credentials were not accepted.</p>'
    }));
  }

  req.session.authenticated = true;
  req.session.username = ADMIN_USERNAME;
  req.session.save(() => {
    res.redirect(ADMIN_PATH);
  });
});

app.post(ADMIN_PATH + '/logout', noIndex, requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect(ADMIN_PATH);
  });
});

app.get('/api/studio/photos', noIndex, requireAuth, (_req, res) => {
  res.json({ photos: store.list().map(studioPhoto) });
});

app.post('/api/studio/photos', noIndex, requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than 25MB.'
        : err.message || 'Upload failed.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a photograph to upload.' });
    }

    const tempPath = req.file.path;
    try {
      const id = crypto.randomBytes(8).toString('hex');
      const files = await images.processUpload(tempPath, id);
      const photo = store.add({
        id,
        title: String(req.body.title || '').trim() || 'Untitled',
        location: String(req.body.location || '').trim(),
        original: files.original,
        thumb: files.thumb,
        position: 'center'
      });
      res.status(201).json({ photo: studioPhoto(photo) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not process that photograph.' });
    } finally {
      fs.unlink(tempPath, () => {});
    }
  });
});

app.patch('/api/studio/photos/:id', noIndex, requireAuth, (req, res) => {
  const photo = store.update(req.params.id, {
    title: req.body.title,
    location: req.body.location,
    position: req.body.position
  });
  if (!photo) {
    return res.status(404).json({ error: 'Photograph not found.' });
  }
  res.json({ photo: studioPhoto(photo) });
});

app.delete('/api/studio/photos/:id', noIndex, requireAuth, (req, res) => {
  const photo = store.remove(req.params.id);
  if (!photo) {
    return res.status(404).json({ error: 'Photograph not found.' });
  }
  try {
    images.removeFiles(photo);
  } catch (error) {
    console.error(error);
  }
  res.json({ ok: true });
});

app.put('/api/studio/photos/reorder', noIndex, requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const photos = store.reorder(ids);
  res.json({ photos: photos.map(studioPhoto) });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

function normalizeAdminPath(value) {
  let pathValue = String(value || '/darkroom').trim();
  if (!pathValue.startsWith('/')) {
    pathValue = '/' + pathValue;
  }
  pathValue = pathValue.replace(/\/+$/, '');
  if (!pathValue || pathValue === '/') {
    pathValue = '/darkroom';
  }
  return pathValue;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.redirect(ADMIN_PATH);
  }
  res.status(401).json({ error: 'Sign in required.' });
}

function noIndex(req, res, next) {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicPhoto(photo) {
  const urls = images.publicUrls(photo);
  return {
    id: photo.id,
    title: photo.title,
    location: photo.location,
    position: photo.position || 'center',
    full: urls.full,
    thumb: urls.thumb
  };
}

function studioPhoto(photo) {
  return Object.assign(publicPhoto(photo), {
    original: photo.original,
    createdAt: photo.createdAt || null
  });
}

function renderThumbnails(photos) {
  if (!photos.length) {
    return '<p class="empty-gallery">New work is on the way.</p>';
  }
  return photos.map((photo) => {
    const urls = images.publicUrls(photo);
    const title = escapeHtml(photo.title || 'Untitled');
    const location = escapeHtml(photo.location || '');
    const position = escapeHtml(photo.position || 'center');
    return [
      '<article>',
      `<a class="thumbnail" href="${escapeHtml(urls.full)}" data-position="${position}">`,
      `<img src="${escapeHtml(urls.thumb)}" alt="${title}" />`,
      '</a>',
      `<h2>${title}</h2>`,
      location ? `<p>${location}</p>` : '',
      '</article>'
    ].join('');
  }).join('');
}

function renderTemplate(name, vars) {
  let html = fs.readFileSync(path.join(ROOT, 'views', name), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), value);
  }
  return html;
}

async function start() {
  console.log('Preparing photograph derivatives…');
  await images.ensureDerivatives(store.list());
  app.listen(PORT, '0.0.0.0', () => {
    console.log('f/stop Photography running on http://localhost:' + PORT);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
