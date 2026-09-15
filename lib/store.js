const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_PATH = path.join(__dirname, '..', 'data', 'gallery.json');

function read() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data.site || typeof data.site !== 'object') {
    data.site = {};
  }
  if (!Array.isArray(data.series)) {
    data.series = [];
  }
  if (!Array.isArray(data.photos)) {
    data.photos = [];
  }
  return data;
}

function write(data) {
  const dir = path.dirname(DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DATA_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, DATA_PATH);
}

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return slug || crypto.randomBytes(4).toString('hex');
}

function uniqueSlug(data, title, ignoreId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  while (data.series.some((item) => item.slug === slug && item.id !== ignoreId)) {
    slug = base + '-' + n;
    n += 1;
  }
  return slug;
}

function site() {
  const data = read();
  return {
    name: data.site.name || 'f/stop',
    tagline: data.site.tagline || 'Photographs from the world around us.',
    about: data.site.about || '',
    email: data.site.email || '',
    featuredPhotoId: data.site.featuredPhotoId || ''
  };
}

function updateSite(fields) {
  const data = read();
  if (typeof fields.about === 'string') {
    data.site.about = fields.about.trim();
  }
  if (typeof fields.email === 'string') {
    data.site.email = fields.email.trim();
  }
  if (typeof fields.tagline === 'string') {
    data.site.tagline = fields.tagline.trim();
  }
  if (typeof fields.featuredPhotoId === 'string') {
    data.site.featuredPhotoId = fields.featuredPhotoId;
  }
  write(data);
  return site();
}

function list() {
  return read().photos;
}

function listSeries() {
  return read().series;
}

function find(id) {
  return list().find((photo) => photo.id === id) || null;
}

function findSeries(idOrSlug) {
  return listSeries().find((item) => item.id === idOrSlug || item.slug === idOrSlug) || null;
}

function photosInSeries(seriesId) {
  return list().filter((photo) => photo.seriesId === seriesId);
}

function featuredPhoto() {
  const data = read();
  const featured = data.photos.find((photo) => photo.id === data.site.featuredPhotoId);
  if (featured) {
    return featured;
  }
  return data.photos[0] || null;
}

function add(photo) {
  const data = read();
  const series = data.series.find((item) => item.id === photo.seriesId);
  if (!series) {
    throw new Error('Choose a series for this photograph.');
  }
  const entry = {
    id: photo.id || crypto.randomBytes(8).toString('hex'),
    seriesId: series.id,
    title: photo.title || 'Untitled',
    location: photo.location || '',
    original: photo.original,
    thumb: photo.thumb,
    position: photo.position || 'center',
    createdAt: photo.createdAt || new Date().toISOString()
  };
  data.photos.push(entry);
  if (photo.featured) {
    data.site.featuredPhotoId = entry.id;
  }
  write(data);
  return entry;
}

function update(id, fields) {
  const data = read();
  const photo = data.photos.find((item) => item.id === id);
  if (!photo) {
    return null;
  }
  if (typeof fields.title === 'string') {
    photo.title = fields.title.trim() || 'Untitled';
  }
  if (typeof fields.location === 'string') {
    photo.location = fields.location.trim();
  }
  if (typeof fields.position === 'string') {
    photo.position = fields.position;
  }
  if (typeof fields.seriesId === 'string' && fields.seriesId) {
    const series = data.series.find((item) => item.id === fields.seriesId);
    if (series) {
      photo.seriesId = series.id;
    }
  }
  if (fields.featured === true) {
    data.site.featuredPhotoId = photo.id;
  }
  write(data);
  return photo;
}

function remove(id) {
  const data = read();
  const index = data.photos.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const [photo] = data.photos.splice(index, 1);
  if (data.site.featuredPhotoId === id) {
    data.site.featuredPhotoId = data.photos[0] ? data.photos[0].id : '';
  }
  write(data);
  return photo;
}

function reorder(ids) {
  const data = read();
  const byId = new Map(data.photos.map((photo) => [photo.id, photo]));
  const next = [];
  for (const id of ids) {
    const photo = byId.get(id);
    if (photo) {
      next.push(photo);
      byId.delete(id);
    }
  }
  for (const photo of byId.values()) {
    next.push(photo);
  }
  data.photos = next;
  write(data);
  return data.photos;
}

function addSeries(fields) {
  const data = read();
  const title = String(fields.title || '').trim() || 'Untitled series';
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    slug: uniqueSlug(data, fields.slug || title),
    title,
    kicker: String(fields.kicker || '').trim(),
    description: String(fields.description || '').trim()
  };
  data.series.push(entry);
  write(data);
  return entry;
}

function updateSeries(id, fields) {
  const data = read();
  const series = data.series.find((item) => item.id === id);
  if (!series) {
    return null;
  }
  if (typeof fields.title === 'string') {
    series.title = fields.title.trim() || 'Untitled series';
  }
  if (typeof fields.kicker === 'string') {
    series.kicker = fields.kicker.trim();
  }
  if (typeof fields.description === 'string') {
    series.description = fields.description.trim();
  }
  if (typeof fields.slug === 'string' && fields.slug.trim()) {
    series.slug = uniqueSlug(data, fields.slug, series.id);
  }
  write(data);
  return series;
}

function removeSeries(id) {
  const data = read();
  if (data.photos.some((photo) => photo.seriesId === id)) {
    throw new Error('Move or remove the photographs in this series first.');
  }
  const index = data.series.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }
  const [series] = data.series.splice(index, 1);
  write(data);
  return series;
}

function reorderSeries(ids) {
  const data = read();
  const byId = new Map(data.series.map((item) => [item.id, item]));
  const next = [];
  for (const id of ids) {
    const series = byId.get(id);
    if (series) {
      next.push(series);
      byId.delete(id);
    }
  }
  for (const series of byId.values()) {
    next.push(series);
  }
  data.series = next;
  write(data);
  return data.series;
}

module.exports = {
  site,
  updateSite,
  list,
  listSeries,
  find,
  findSeries,
  photosInSeries,
  featuredPhoto,
  add,
  update,
  remove,
  reorder,
  addSeries,
  updateSeries,
  removeSeries,
  reorderSeries
};
