# Promise

Promise is a privacy-conscious accountability tool for reviewing commitments in existing conversations. This repository includes the product concept and planning documents, a landing page, and a runnable local application.

## Runnable local application

The current application is in [app/](app/). It imports conversation exports, tracks personal commitments and effort obligations, and offers a read-only Gmail connector plus a browser extension for visible webmail conversations.

Requirements: Node.js 22.13 or newer. No npm dependencies are required.

On Windows, extract the repository and double-click [app/Start-Promise.cmd](app/Start-Promise.cmd). It starts the local server and opens the app at http://localhost:4310. To run it from a terminal:

```sh
cd app
node server.mjs
```

Run the checks from `app/`:

```sh
npm test
npm run check
```

GitHub Actions runs these tests and syntax checks on Node.js 22.13 and 24. CodeQL scans the JavaScript on changes to `main` and weekly. Dependabot checks the app's npm manifest and GitHub Actions weekly; this app currently declares no npm dependencies, so npm dependency updates will appear only when dependencies are added.

The app stores its database and encryption key in `app/data/`. Keep that directory private and out of Git. See [app/README.md](app/README.md) for setup, Gmail OAuth configuration, browser-extension installation, privacy and data-handling details, limitations, and backup guidance. Actual Gmail access requires the operator's own Google Cloud OAuth credentials and user consent.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting. Dependabot alerts, security updates, secret scanning, and push protection are repository security settings; review their status under **Settings → Security & quality → Advanced Security**.

## Product documents

- [Business plan](docs/Promise_Business_Plan_Final.md)
- [Strategic vision](docs/Promise_Strategic_Vision.md)
- [Technical architecture](docs/Promise_Technical_Architecture.md)
- [Deployment target](DEPLOYMENT_TARGET.md)
- [Landing page](index.html)

The app runs locally. Production deployment must follow the Hetzner target documented in [DEPLOYMENT_TARGET.md](DEPLOYMENT_TARGET.md).
