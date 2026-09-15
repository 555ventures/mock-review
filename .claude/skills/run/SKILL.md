---
name: run
description: "Use to run the reviewer against a host app during development."
allowed-tools:
  - Bash(npm run:*)
  - Bash(node:*)
---

`npm run build` then, from a host app directory that has `mock.config.ts`: `node <this repo>/dist/cli.js serve` — first stdout line is the URL; `design/.serve.json` holds `{url, pid}` while it runs; `GET <url>/__mock-review/ping` answers `{ok:true}`.
