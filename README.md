# Flightdeck

<div align="center">

**Local-first AWS, GitHub Actions, and Fly.io control panel** — one UI for secrets, Amplify, IAM, audit, Actions, and Fly app management.

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Features](#features) ·
[Install](#install) ·
[Usage](#usage) ·
[Configuration](#configuration) ·
[Docker](#docker) ·
[Desktop (Electron)](#desktop-electron) ·
[Docs](#documentation)

**Repository** — [github.com/gushwork/flightdeck](https://github.com/gushwork/flightdeck)

</div>

---

## What it does

Flightdeck is a [Next.js](https://nextjs.org) 16 app you run on your machine. It talks to **AWS** with your normal credential chain or named `~/.aws` profiles, to **GitHub** using the [GitHub CLI](https://cli.github.com/) (`gh auth token`), and to **Fly.io** using the [Fly CLI](https://fly.io/docs/flyctl/) (`fly auth login`).

An **optional** AI sidecar (OpenRouter) can answer questions with read-only tools and emit **change plans you copy out** (CLI/JSON) — it does not apply changes server-side for you. Secret values are not passed to the model on the sanitizer paths in this codebase.

*Package name in `package.json`: `flightdeck`.*

---

## Features

| Area | You get |
|------|---------|
| **Secrets Manager** | List, search, CRUD, bulk edit, versions, triage/insights, optional CloudTrail around `GetSecretValue` |
| **Amplify (Gen 1)** | Apps, app/branch env vars, cross-app env search |
| **Access Analyzer** | Analyzers and findings |
| **IAM** | Search roles/users/policies; **cross-account copy** (target must be a **named** profile); **create user** from a template (console + key) |
| **GitHub Actions** | Overview, all runs, workflows; re-run, cancel, enable/disable, **workflow_dispatch** (inputs from YAML) |
| **Fly.io** | App health overview (machines, regions, checks); secrets management (list, set, unset) via `flyctl` |
| **Agent** (optional) | Chat + tools (registry-gated: secrets, audit, CloudTrail, propose). Requires `OPENROUTER_API_KEY` |

---

## Install

**Prerequisites**

- Node.js **20+**
- **npm** (uses `package-lock.json`)
- **AWS** credentials (profiles, env, or instance role) for accounts you manage
- **GitHub CLI** (`gh`) installed and `gh auth login` for Actions/API screens
- **Fly CLI** (`flyctl` or `fly`) installed and `fly auth login` for Fly.io screens
- **OpenRouter** API key only if you use the built-in agent

**From source**

```bash
git clone https://github.com/gushwork/flightdeck.git
cd flightdeck
npm install
```

---

## Usage

**Development** (default **http://localhost:3325**)

```bash
npm run dev
```

**Production** (after `npm run build`)

```bash
npm run start
# or standalone output:
npm run start:standalone
```

---

## Configuration

| Variable | Purpose |
| -------- | ------- |
| `OPENROUTER_API_KEY` | Required for `POST /api/agent/chat` (503 if missing) |
| `OPENROUTER_MODEL` | Default model id; UI and requests can override |
| `DATABASE_URL` | Optional Postgres TTL cache for list reads (`lib/cache.ts`) — app works without it |
| `NEXT_PUBLIC_AWS_PROFILES` | Comma-separated profile **names** for the region/profile UI |
| `NEXT_PUBLIC_AGENT_ENABLED` | `false` hides the agent in the built app |
| `AWS_REGION` | Fallback region when the client omits one |
| `FLIGHTDECK_PORT` / `FLIGHTDECK_ELECTRON_DEV` | Electron shell (`electron/main.cjs`) |

GitHub does not use a token env var: the server calls `gh auth token`.
Fly.io does not use a token env var: the server calls `flyctl` directly using the local CLI session.

---

## Docker

`next.config.ts` uses `output: "standalone"`. The included **Dockerfile** runs as a non-root user on **port 3325**. Pass the same env vars as above; mount `~/.aws` if you use file credentials in the container.

```bash
docker build -t flightdeck .
docker run --rm -p 3325:3325 -e OPENROUTER_API_KEY=... flightdeck
```

---

## Desktop (Electron)

| Script | What it does |
| ------ | -------------- |
| `npm run electron:dev` | `next dev` on 3325 + Electron with `FLIGHTDECK_ELECTRON_DEV=1` |
| `npm run electron:pack` | `next build` + `electron-builder --dir` |
| `npm run electron:dist` | Full packaging → `dist-electron/` (see `package.json` `build` for targets) |

---

## Development

| Script | Description |
| ------ | ----------- |
| `npm run build` | Production build + `scripts/copy-standalone-assets.mjs` |
| `npm run lint` | ESLint |

Typecheck: `npx tsc --noEmit`

---

## Documentation

- **[CODEBASE.md](CODEBASE.md)** — API map, DTOs, agent behavior, and gotchas (maintained with substantive code changes)
- **Module & nav wiring** — `lib/modules/registry.ts` (feature toggles and agent tool groups)

---

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npx tsc --noEmit` and `npm run lint`. For larger changes, skim `CODEBASE.md` and keep client/server boundaries (no Node-only imports under `"use client"` components).

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Flightdeck
