# Logic Games

A collection of logic puzzles that runs in the browser and can be installed as an offline PWA. Currently includes **Queens**, with unlimited on-device puzzle generation, auto-save, and adjustable hints.

**Play:** https://bend3.github.io/logic-games/

## Run locally

No build step or dependencies – just serve the folder:

```powershell
python -m http.server 8123
# open http://localhost:8123/
```

## Deploying

Pushing to `main` publishes via GitHub Pages. **Bump `VERSION` in [sw.js](sw.js) with every deploy**, or installed/offline copies won't update. See [docs/deployment.md](docs/deployment.md).

## Docs

See [docs/README.md](docs/README.md) for architecture, the Queens engine, adding new games, and deployment.

## License

[MIT](LICENSE)
