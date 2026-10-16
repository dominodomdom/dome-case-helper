# 07 — Release and deployment

## Install & run

```sh
bun install            # uses bun.lock; do not switch package manager
cp .env.example .env
bun run dev
bun run build          # output: dist/ (client + nitro server, Cloudflare Worker target)
bun run preview
```

## Portability

| Class                      | Item                                                           | Status                                                                |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| A npm packages             | all deps incl. `@lovable.dev/vite-tanstack-config`             | install/build verified in Lovable sandbox; outside Lovable UNVERIFIED |
| B Lovable runtime services | Lovable AI Gateway                                             | required for AI features                                              |
| C Lovable config           | vite config preset (plugins, env injection, Cloudflare target) | from npm package                                                      |
| D Server runtime           | server functions need a Worker/Node host (nitro)               | Lovable publish verified historically; other hosts UNVERIFIED         |

## Pre-release checklist

- Type check, tests, lint (0 errors), build green.
- `LOVABLE_API_KEY` present on the server.
- D2 SQL audit + concurrency test executed and passed; `03_deprecate_2param.sql` applied.
- Signed-in E2E (docs/06) passed.

## Rollback

Use Lovable version history (restore a previous version) or the connected Git history. No DB
migrations are tied to app versions, except: the app requires the 3-param RPC to exist.
