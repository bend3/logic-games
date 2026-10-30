# Running and deploying

## Local

Any static server works; ES modules and service workers do not work from `file://`.

```powershell
python -m http.server 8123
# open http://localhost:8123/
```

`localhost` counts as a secure context, so the service worker and install prompt work locally. When testing changes, either bump `VERSION` in `sw.js` or use DevTools → Application → Service workers → "Update on reload" / "Bypass for network"; otherwise the cache-first worker serves the old files.

## GitHub Pages

1. Push the repo to GitHub (public repo for free Pages).
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder **`/` (root)**. (Not `/docs` – that folder is documentation only.)
3. Site URL: `https://<user>.github.io/<repo>/`.

## Release checklist

1. Every runtime file is listed in `FILES` in `sw.js`.
2. `VERSION` in `sw.js` is bumped (e.g. `v1` → `v2`). Without this, installed apps keep the old version.
3. Saved-data shapes are still compatible, or old saves are handled.

## Icons

`icons/icon.svg` is the source design. Regenerate the PNGs after changing it (keep the drawing in `tools/make-icons.py` in sync – it re-implements the design with simple shapes):

```powershell
python tools/make-icons.py
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Changes don't show up on the phone | `VERSION` not bumped, or the app hasn't been reopened yet since deploy. |
| Works online, broken offline | A file is missing from `FILES` in `sw.js`. |
| Service worker never installs | A path in `FILES` 404s (install is all-or-nothing). |
| Broken assets on GitHub Pages only | An absolute path (`/js/...`) was used; must be relative. |
| "Could not create a puzzle." | The generator worker failed to load (offline and missing from `FILES`, or the browser can't run module workers). |
