# f/stop Photography

A photo-centric portfolio for f/stop Photography. The public gallery keeps the original Lens-style layout — a large photograph on the left, with a filmstrip of thumbnails on the right — restyled as a clean, museum-like presentation so the pictures lead.

## Run locally

1. Copy `.env.example` to `.env`
2. Set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`
3. Install and start:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Private studio

The public gallery does not link to the upload interface. After signing in at the studio URL from your `.env` (`ADMIN_PATH`, default `/darkroom`), you can:

- Upload new photographs (JPEG, PNG, or WebP)
- Set a title and location
- Reorder the gallery
- Remove photographs
- Sign out

Search engines are told not to index that path. Change `ADMIN_PATH` if you want a different private address, and keep the password only on the server.

## Deploy

This is a Node.js app, not a static GitHub Pages site. Any host that can run Node 18+ and keep a disk for `images/` and `data/` will work (Render, Railway, Fly.io, a VPS). Set the same environment variables there, and persist the `images/` and `data/` directories so new uploads survive restarts.

## Notes

- Gallery order and captions live in `data/gallery.json`
- Originals are stored in `images/fulls/`; the site serves resized copies from `images/web/` and `images/thumbs/`
- Uploads are limited to 25MB
- Layout inspired by [Lens](https://html5up.net/lens) by HTML5 UP
