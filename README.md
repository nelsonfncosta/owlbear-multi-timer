# Owlbear Multi Timer

Multi-timer extension for Owlbear Rodeo.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) that deploys `dist` on pushes to `main`.

1. Push this repository to GitHub.
2. In GitHub, open `Settings -> Pages`.
3. Under Build and deployment, select `GitHub Actions`.
4. Push to `main` (or run the workflow manually).
5. After deploy, your extension manifest URL will be:

`https://<your-github-username>.github.io/<repo-name>/manifest.json`

Use that manifest URL in Owlbear Rodeo to install/share the extension for testing.
