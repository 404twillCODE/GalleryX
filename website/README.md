# GalleryX Website

A clean, animated marketing site for GalleryX, built with Vite, React, TypeScript, Tailwind CSS,
and Framer Motion. It's a standalone project — separate from the Electron app in the repo root —
so it can be deployed independently (Vercel, Netlify, GitHub Pages, etc.).

The UI mockups used throughout the site (gallery grid, timeline, duplicate review, video player)
are hand-built CSS/SVG scenes rather than real screenshots, so the site never goes stale as the
app's UI evolves and there's no need to keep screenshots in sync.

## Develop

```bash
cd website
npm install
npm run dev
```

## Build

```bash
npm run build   # outputs to website/dist
npm run preview # serve the production build locally
```

## GitHub links

Source and download URLs live in `src/lib/github.ts` and currently point at
`https://github.com/404twillCODE/GalleryX` (repo + `/releases/latest` / `v0.2.0` assets).
