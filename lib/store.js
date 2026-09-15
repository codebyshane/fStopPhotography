const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_PATH = path.join(__dirname, '..', 'data', 'gallery.json');

function read() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);
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

function list() {
  return read().photos;
}

function find(id) {
  return list().find((photo) => photo.id === id) || null;
}

function add(photo) {
  const data = read();
  const entry = {
    id: photo.id || crypto.randomBytes(8).toString('hex'),
    title: photo.title || 'Untitled',
    location: photo.location || '',
    original: photo.original,
    thumb: photo.thumb,
    position: photo.position || 'center',
    createdAt: photo.createdAt || new Date().toISOString()
  };
  data.photos.push(entry);
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

module.exports = {
  list,
  find,
  add,
  update,
  remove,
  reorder
};
