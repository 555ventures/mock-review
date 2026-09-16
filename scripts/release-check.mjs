#!/usr/bin/env node
// Release gate (D25). Asserts dist/ is complete, committed, in sync with src/frame/entry.tsx,
// not stale relative to src/ changes, and correctly base-pathed. Never runs under `npm run
// check` — dist/ is a release-only artifact (D15), so staleness between releases is by design.
//
// Exits 1 with the offending path named on any failure, exits 0 silently on success.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function relPathExists(relPath) {
  return existsSync(path.join(root, relPath));
}

// 1. Required dist/ entries exist.
const requiredFiles = [
  "dist/cli.js",
  "dist/index.js",
  "dist/vite.js",
  "dist/page/index.html",
  "dist/frame/entry.tsx",
];

for (const relPath of requiredFiles) {
  if (!relPathExists(relPath)) {
    fail(`missing required build output: ${relPath}`);
  }
}

const assetsDir = path.join(root, "dist/page/assets");
let hasJsAsset = false;
if (existsSync(assetsDir)) {
  hasJsAsset = readdirSync(assetsDir).some((name) => name.endsWith(".js"));
}
if (!hasJsAsset) {
  fail("missing required build output: dist/page/assets/*.js");
}

// 2. Each required path is git-tracked, and dist/ has no uncommitted changes.
const trackedPaths = [...requiredFiles];
for (const relPath of trackedPaths) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", relPath], {
      cwd: root,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    fail(`not tracked by git: ${relPath}`);
  }
}

const distStatus = git(["status", "--porcelain", "--", "dist"]).trim();
if (distStatus.length > 0) {
  const firstLine = distStatus.split("\n")[0];
  fail(`dist/ has uncommitted changes (git status --porcelain -- dist): ${firstLine}`);
}

// 3. dist/frame/entry.tsx is byte-equal to src/frame/entry.tsx.
const distFrameEntry = readFileSync(path.join(root, "dist/frame/entry.tsx"));
const srcFrameEntryPath = "src/frame/entry.tsx";
if (!relPathExists(srcFrameEntryPath)) {
  fail(`missing source file: ${srcFrameEntryPath}`);
}
const srcFrameEntry = readFileSync(path.join(root, srcFrameEntryPath));
if (!distFrameEntry.equals(srcFrameEntry)) {
  fail(`dist/frame/entry.tsx is not byte-equal to ${srcFrameEntryPath}`);
}

// 4. No commit after the last commit touching dist/ touched src/, vite.page.config.ts or
// tsconfig.build.json.
const lastDistCommit = git(["log", "-1", "--format=%H", "--", "dist"]).trim();
if (lastDistCommit.length === 0) {
  fail("no commit touches dist/ — dist/ must be committed before release");
}

const staleWatchPaths = ["src", "vite.page.config.ts", "tsconfig.build.json"];
const staleLog = git([
  "log",
  "--format=%H",
  "--name-only",
  `${lastDistCommit}..HEAD`,
  "--",
  ...staleWatchPaths,
]).trim();

if (staleLog.length > 0) {
  const lines = staleLog.split("\n").filter((line) => line.length > 0);
  const offendingCommit = lines[0];
  const offendingPath = lines.slice(1).find((line) => !/^[0-9a-f]{40}$/.test(line)) ?? lines[1];
  fail(
    `commit ${offendingCommit} touched ${offendingPath ?? "a watched path"} after the last dist/ commit (${lastDistCommit}) — rebuild and recommit dist/`,
  );
}

// 5. dist/page/index.html references the /__mock-review/page/assets/ base.
const indexHtml = readFileSync(path.join(root, "dist/page/index.html"), "utf8");
if (!indexHtml.includes("/__mock-review/page/assets/")) {
  fail("dist/page/index.html does not reference the /__mock-review/page/assets/ base");
}

process.exit(0);
