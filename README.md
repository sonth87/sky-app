# Sky-App

> **Multi-app, multi-environment platform** — a "desktop OS" that runs on both **Web** and **Electron**, **online + offline**, where each application (Ceremony, TTS Studio, ...) is a **sub-app** plugged in through a shared contract. The UI uses [`device-layout`](https://github.com/sonth87/device-layout) to visualize windows/dock/menubar like a desktop.

**Status:** 🟢 Active development. The platform shell, Ceremony + TTS Studio sub-apps, licensing, and the SQLite storage foundation are implemented. Architecture and roadmap docs live in [`docs/`](./docs/); an in-progress feature (layout-designer + Event) is planned in [`docs/roadmap/plans/layout-designer/`](./docs/roadmap/plans/layout-designer/).

---

## What to read first?

| You are... | Read |
|---|---|
| 🤖 **AI agent** (Claude, ...) | [`AGENTS.md`](./AGENTS.md) — mandatory rules BEFORE doing anything |
| 🧭 **New here / want the big picture** | [`docs/README.md`](./docs/README.md) — navigation map for all documentation |
| 🏛️ **Want to understand the architecture** | [`docs/architecture/overview.md`](./docs/architecture/overview.md) |
| 🧩 **Want to add a sub-app** | [`docs/guides/adding-an-app.md`](./docs/guides/adding-an-app.md) |
| 🔧 **Dev actively coding** | [`docs/dev/`](./docs/dev/) — versioning, changelog, code conventions |

---

## What it is / isn't

**IS:** a shell/platform hosting multiple shared apps + services, separating environments via **ports & adapters** (1 codebase → 2 runtimes Web/Electron), with **license/entitlement** gating per app/feature.

**IS NOT:** a single application. Ceremony (event-organization module, ported from the original Slide project) is only the **first sub-app** migrated over, not the whole project.

## Origin

Sky-App is the evolution of the multi-app direction from the `trao-bang-tot-nghiep-2026` project (see `docs/multi-verse.md` in that repo). The Ceremony app (event/ceremony organization — no longer tied to the specific "graduation ceremony" name, since the platform is shared across many organization types) + TTS were migrated here as the first sub-apps.

## Tech stack

React 19 · TypeScript · Tailwind v4 · shadcn/ui · TanStack Query · Zustand · Electron · Vite / electron-vite · pnpm workspace + Turborepo · Changesets.

## Structure

```
apps/       shell-electron, shell-web, tts-service
packages/   kernel, platform-electron, platform-web, device-shell, ui,
            service-contracts, licensing, build-config
modules/    ceremony, ceremony-backdrop, tts-studio   (sub-apps)
docs/       documentation (see docs/README.md)
```

## Adding a license key (dev/local)

Any sub-app that declares an `entitlement` (e.g. Ceremony) will be **hidden from the dock** if
the machine doesn't have a valid license. Full details (model, how to issue a real license,
security limits): see
[`docs/guides/licensing-entitlement.md`](./docs/guides/licensing-entitlement.md).

**1. Generate a dev license key** (run from the repo root):

```bash
node scripts/gen-dev-license.mjs app.ceremony
# multiple entitlements at once:
node scripts/gen-dev-license.mjs app.ceremony feature.ceremony.voice-clone
```

This prints a license key string, signed with a fixed DEV private key baked into the script —
**do not use this to issue real licenses to customers**.

**2. Load the key wherever the running shell reads it from:**

- **Web** (`shell-web`) — open the DevTools console on the running app page and run:
  ```js
  localStorage.setItem('sky-app-license', '<key printed above>')
  ```
  then reload the page.

- **Electron** (`shell-electron`) — write the `userData/license.key` file via IPC from the
  renderer's DevTools console:
  ```js
  await window.sky.invoke('kernel:license:write', '<key printed above>')
  ```
  then reload the window.
