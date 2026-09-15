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
  const site = store.site();
  const featured = store.featuredPhoto();
  const featuredUrls = featured ? images.publicUrls(featured) : null;
  const featuredSeries = featured ? store.findSeries(featured.seriesId) : null;
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderTemplate('home.html', {
    year: String(new Date().getFullYear()),
    tagline: escapeHtml(site.tagline),
    about: escapeHtml(site.about),
    heroClass: featuredUrls ? '' : 'is-empty',
    heroImage: featuredUrls ? escapeHtml(featuredUrls.full) : '',
    heroTitle: featured ? escapeHtml(featured.title) : 'New work is on the way.',
    heroLocation: featured ? escapeHtml(featured.location || '') : '',
    heroSeriesUrl: featuredSeries ? '/work/' + encodeURIComponent(featuredSeries.slug) : '/#work',
    heroSeriesName: featuredSeries ? escapeHtml(featuredSeries.title) : 'Work',
    chapters: renderChapters()
  }));
});

app.get('/about', (_req, res) => {
  const site = store.site();
  const photographer = site.photographer || site.name || 'f/stop';
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderTemplate('about.html', {
    year: String(new Date().getFullYear()),
    photographer: escapeHtml(photographer),
    tagline: escapeHtml(site.tagline),
    about: paragraphs(site.about),
    inquiries: paragraphs(site.inquiries || 'For prints, assignments, licensing, or a conversation about the work.'),
    emailBlock: renderEmailBlock(site.email),
    inquiryForm: renderInquiryForm(site)
  }));
});

app.get('/work/:slug', (req, res) => {
  const series = store.findSeries(req.params.slug);
  if (!series) {
    return res.status(404).set('Cache-Control', 'no-store').type('html').send(renderTemplate('404.html', {}));
  }
  const photos = store.photosInSeries(series.id).map(publicPhoto);
  if (!photos.length) {
    return res.status(404).set('Cache-Control', 'no-store').type('html').send(renderTemplate('404.html', {}));
  }
  const startId = String(req.query.p || photos[0].id);
  const startIndex = Math.max(0, photos.findIndex((photo) => photo.id === startId));
  res.set('Cache-Control', 'no-store');
  res.type('html').send(renderTemplate('series.html', {
    seriesTitle: escapeHtml(series.title),
    seriesKicker: escapeHtml(series.kicker || ''),
    seriesDescription: escapeHtml(series.description || ''),
    count: String(photos.length),
    countLabel: photos.length === 1 ? 'photograph' : 'photographs',
    filmstrip: renderFilmstrip(photos),
    seriesData: JSON.stringify({
      title: series.title,
      slug: series.slug,
      photos,
      index: startIndex
    }).replace(/</g, '\\u003c')
  }));
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

app.get('/api/studio/exhibition', noIndex, requireAuth, (_req, res) => {
  res.json(studioPayload());
});

app.patch('/api/studio/site', noIndex, requireAuth, (req, res) => {
  const site = store.updateSite({
    photographer: req.body.photographer,
    about: req.body.about,
    inquiries: req.body.inquiries,
    email: req.body.email,
    tagline: req.body.tagline,
    featuredPhotoId: req.body.featuredPhotoId
  });
  res.json({ site, exhibition: studioPayload() });
});

app.post('/api/studio/series', noIndex, requireAuth, (req, res) => {
  const series = store.addSeries({
    title: req.body.title,
    kicker: req.body.kicker,
    description: req.body.description
  });
  res.status(201).json({ series, exhibition: studioPayload() });
});

app.patch('/api/studio/series/:id', noIndex, requireAuth, (req, res) => {
  const series = store.updateSeries(req.params.id, {
    title: req.body.title,
    kicker: req.body.kicker,
    description: req.body.description
  });
  if (!series) {
    return res.status(404).json({ error: 'Series not found.' });
  }
  res.json({ series });
});

app.delete('/api/studio/series/:id', noIndex, requireAuth, (req, res) => {
  try {
    const series = store.removeSeries(req.params.id);
    if (!series) {
      return res.status(404).json({ error: 'Series not found.' });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/studio/series/reorder', noIndex, requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  res.json({ series: store.reorderSeries(ids) });
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
      return res.status(400).json({ error: 'Choose a photograph to hang.' });
    }

    const tempPath = req.file.path;
    try {
      const id = crypto.randomBytes(8).toString('hex');
      const files = await images.processUpload(tempPath, id);
      const photo = store.add({
        id,
        seriesId: String(req.body.seriesId || ''),
        title: String(req.body.title || '').trim() || 'Untitled',
        location: String(req.body.location || '').trim(),
        original: files.original,
        thumb: files.thumb,
        position: 'center',
        featured: req.body.featured === 'true' || req.body.featured === true
      });
      res.status(201).json({ photo: studioPhoto(photo), exhibition: studioPayload() });
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: error.message || 'Could not process that photograph.' });
    } finally {
      fs.unlink(tempPath, () => {});
    }
  });
});

app.patch('/api/studio/photos/:id', noIndex, requireAuth, (req, res) => {
  const photo = store.update(req.params.id, {
    title: req.body.title,
    location: req.body.location,
    position: req.body.position,
    seriesId: req.body.seriesId,
    featured: req.body.featured
  });
  if (!photo) {
    return res.status(404).json({ error: 'Photograph not found.' });
  }
  res.json({ photo: studioPhoto(photo), exhibition: studioPayload() });
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
  res.json({ ok: true, exhibition: studioPayload() });
});

app.put('/api/studio/photos/reorder', noIndex, requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  store.reorder(ids);
  res.json(studioPayload());
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.use((_req, res) => {
  res.status(404).set('Cache-Control', 'no-store').type('html').send(renderTemplate('404.html', {}));
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

function noIndex(_req, res, next) {
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

function paragraphs(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return escapeHtml(text).replace(/\n+/g, '</p><p>');
}

function isPublicEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function renderEmailBlock(email) {
  if (!isPublicEmail(email)) {
    return '<p class="inquiry-closed">An inquiry address has not been published yet.</p>';
  }
  const safe = escapeHtml(email.trim());
  return [
    '<p class="inquiry-direct">',
    `<a class="inquiry-mail" href="mailto:${safe}">${safe}</a>`,
    '</p>'
  ].join('');
}

function renderInquiryForm(site) {
  if (!isPublicEmail(site.email)) {
    return '';
  }
  const email = escapeHtml(site.email.trim());
  return [
    `<form class="inquiry-form" id="inquiry-form" data-email="${email}">`,
    '<label><span>Name</span><input type="text" name="visitor" maxlength="80" autocomplete="name" required /></label>',
    '<label><span>Your email</span><input type="email" name="replyTo" maxlength="120" autocomplete="email" /></label>',
    '<label><span>About</span>',
    '<select name="topic">',
    '<option value="Prints">Prints</option>',
    '<option value="Assignment">Assignment</option>',
    '<option value="Licensing">Licensing</option>',
    '<option value="The work">The work</option>',
    '<option value="Other">Other</option>',
    '</select></label>',
    '<label><span>Note</span><textarea name="message" rows="6" maxlength="2000" required placeholder="What are you hoping to make, license, or ask about?"></textarea></label>',
    '<p id="inquiry-status" class="status" role="status"></p>',
    '<button type="submit">Write the email</button>',
    '</form>'
  ].join('');
}

function publicPhoto(photo) {
  const urls = images.publicUrls(photo);
  return {
    id: photo.id,
    seriesId: photo.seriesId || '',
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

function studioPayload() {
  const site = store.site();
  return {
    site,
    series: store.listSeries(),
    photos: store.list().map(studioPhoto)
  };
}

function renderChapters() {
  const seriesList = store.listSeries();
  const cards = seriesList.map((series) => {
    const photos = store.photosInSeries(series.id);
    if (!photos.length) {
      return '';
    }
    const cover = images.publicUrls(photos[0]);
    const count = photos.length === 1 ? '1 photograph' : photos.length + ' photographs';
    return [
      `<a class="chapter" href="/work/${encodeURIComponent(series.slug)}">`,
      `<div class="chapter-image"><img src="${escapeHtml(cover.thumb)}" alt="${escapeHtml(series.title)}" /></div>`,
      '<div class="chapter-copy">',
      series.kicker ? `<p class="kicker">${escapeHtml(series.kicker)}</p>` : '',
      `<h2>${escapeHtml(series.title)}</h2>`,
      series.description ? `<p class="chapter-lede">${escapeHtml(series.description)}</p>` : '',
      `<p class="chapter-count">${count}</p>`,
      '</div>',
      '</a>'
    ].join('');
  }).filter(Boolean);
  if (!cards.length) {
    return '<p class="empty-gallery">The walls are being hung.</p>';
  }
  return cards.join('');
}

function renderFilmstrip(photos) {
  return photos.map((photo, index) => (
    `<button class="strip-thumb" type="button" data-index="${index}" aria-label="${escapeHtml(photo.title)}">` +
    `<img src="${escapeHtml(photo.thumb)}" alt="" />` +
    '</button>'
  )).join('');
}

function renderTemplate(name, vars) {
  let html = fs.readFileSync(path.join(ROOT, 'views', name), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), value == null ? '' : String(value));
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
