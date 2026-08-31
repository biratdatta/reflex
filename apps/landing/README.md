# Reflex landing page

A single static page. No build step, no framework, no dependencies — an `index.html` with inline
styles and the assets it needs.

## Local

Any static server will do:

```bash
npx serve apps/landing        # or: python3 -m http.server -d apps/landing 4321
```

## Deploying

Vercel serves this directory as-is. Two routes:

**Git integration** (auto-deploys on push): import the repository at
[vercel.com/new](https://vercel.com/new), then set **Root Directory** to `apps/landing` and leave the
framework preset as *Other*. No build command.

**CLI:**

```bash
npx vercel --cwd apps/landing            # preview
npx vercel --cwd apps/landing --prod     # production
```

## Assets

`assets/` holds copies of the screenshots and the demo video from `docs/`, so the page is
self-contained and does not hotlink the repository. Refresh them with:

```bash
cp docs/reflex-demo-silent.mp4        apps/landing/assets/demo.mp4
cp docs/screenshots/popup-capabilities.png apps/landing/assets/panel-light.png
cp docs/screenshots/popup-dark.png    apps/landing/assets/panel-dark.png
cp docs/screenshots/popup-inspector.png    apps/landing/assets/panel-inspector.png
cp docs/screenshots/popup-triage.png  apps/landing/assets/panel-triage.png
cp docs/screenshots/demo-register.png apps/landing/assets/service.png
cp docs/screenshots/demo-video-poster.png  apps/landing/assets/demo-poster.png
```
