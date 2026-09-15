# f/stop Photography

A living exhibition: one opening photograph, work grouped into series, and a private studio for hanging new frames.

## Run locally

1. Copy `.env.example` to `.env`
2. Set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`
3. Install and start:

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Public site

- `/` — full-bleed opening frame, then a list of series
- `/work/:series` — one photograph at a time, with a hideable index
- `/about` — a short note and inquiries

## Private studio

The public pages do not link to the studio. Sign in at the path in `.env` (`ADMIN_PATH`, default `/darkroom`) to:

- Hang a new photograph into a series
- Mark one frame as the opening image on the home page
- Add, rename, and reorder series
- Caption, move, reorder, and remove photographs

Search engines are told not to index that path.

## Deploy

This is a Node.js app. Host it where Node 18+ can run and `images/` plus `data/` can persist.

## Notes

- Exhibition data lives in `data/gallery.json`
- Originals are in `images/fulls/`; the site serves resized copies from `images/web/` and `images/thumbs/`
- Uploads are limited to 25MB
