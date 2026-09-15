# The design freeze of the mock reviewer

This folder is the **binding record of how the mock reviewer looks and behaves**, taken from the
working prototype at

```
/home/jj/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks
```

on 2026-09-15.

| file | what it is |
| --- | --- |
| `design-reference.md` | the written contract: every surface, control, state, tone, shortcut and behaviour rule, each cited to `file:line` in the prototype |
| `atlas/` | 59 screenshots — one per surface/state named `NN-<surface>-<state>.png` |
| `capture-atlas.mjs` | the exact Playwright script that produced the atlas |

## The rule

**The rebuild must match these surfaces one for one; code structure changes, the design does not.**

Anything in `design-reference.md` or visible in `atlas/` is acceptance criteria. A rebuild may
reorganise files, rename components, change state management, swap the build tooling — but the
surfaces, their controls and labels, the three-tone status model, the spacing and sizing rules, the
keyboard shortcuts and every behaviour rule in §13 must come out the same. Where a surface could not
be reached in the prototype, §15 says so; those are not licence to invent one.

## How the atlas was captured

Start the prototype's dev server (leave it running):

```bash
cd /home/jj/projects/claude-plugins/.claude/worktrees/agent-ae25a43a1031bd49a/prototypes/react-mocks
npx vite --host 127.0.0.1 --port 45980 --strictPort
```

Then, from that same directory (it supplies the installed `playwright`):

```bash
node /home/jj/projects/mock-review/docs/design/capture-atlas.mjs
```

The script drives Chromium at a **1600×1000** viewport, `deviceScaleFactor: 1`, walking the reviewer
by hash route and by clicking its real controls, and writes every PNG to `atlas/`. It seeds
`sessionStorage` (`view`, `side-tab`, `guide-off`) before the first load so the run starts from a
known chrome state.

Two notes on reproducing it:

- The script's **last two steps approve note N004 through the UI**, which writes the prototype's
  `notes.json`. That was the only way to photograph the approved (blue) tone; see
  `design-reference.md` §15. Re-running the script against already-approved data will show N004 blue
  in the earlier shots too.
- Screenshot numbering is sequential in script order, so inserting a capture renumbers everything
  after it. The reference cites files by name — update both together.
