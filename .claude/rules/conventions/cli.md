---
paths:
  - "src/cli/**"
---

A verb is one module exporting `run(argv, io)`; `io` carries `stdout`/`stderr`/`cwd`. `--json` may appear anywhere in argv. JSON verbs write exactly one `JSON.stringify(obj)` + newline to stdout and nothing else; every diagnostic goes to stderr. `contract` never imports Vite or touches the host. Exit 0 on success, 2 on usage or refusal.
