// D12: `check --look`'s Playwright capture. `playwright` is an optional peer resolved from the
// HOST root (never a static package import — spec 01/02's package must load with no `playwright`
// present at all), so an unresolvable module surfaces as a typed error the CLI wave maps to
// `mock-review: --look needs playwright — remedy: npm i -D playwright` (exit 2). The "no serve
// running" refusal is the CLI wave's job (src/analysis/liveness.ts's `serveUrl` already owns that
// probe) — this module only ever receives an already-live `serveUrl`.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
/** Thrown when `playwright` cannot be resolved from the host root. The message is exactly the
 * remedy text the dispatcher (src/cli.ts) prints after its `mock-review: ` prefix. */
export class PlaywrightUnresolvedError extends Error {
}
/** Resolves `playwright` from `root` (the host, not this package) via `createRequire`, then loads
 * it with a dynamic `import()` so the package itself never statically depends on it. */
async function resolvePlaywright(root) {
    const require = createRequire(path.join(root, 'package.json'));
    let resolved;
    try {
        resolved = require.resolve('playwright');
    }
    catch {
        throw new PlaywrightUnresolvedError('--look needs playwright — remedy: npm i -D playwright');
    }
    const imported = (await import(pathToFileURL(resolved).href));
    const mod = imported.default ?? imported;
    if (!mod.chromium) {
        throw new PlaywrightUnresolvedError('--look needs playwright — remedy: npm i -D playwright');
    }
    return mod;
}
/** Parses a `WxH` viewport spec (D9's config shape) into numeric width/height. */
function parseViewport(spec) {
    const [w, h] = spec.split('x');
    return { width: Number(w), height: Number(h) };
}
/**
 * D12/D22: opens `<serveUrl>/?frame=1[&_theme=<theme>]#/<screen>?state=<s>&scheme=<scheme>` for
 * every `config.targets.viewports x config.targets.schemes x` (one state, or every state in
 * `states` when `state` is omitted) in headless Chromium at that viewport size, waits for network
 * idle, and writes `design/screenshots/<screen>-<state>-<WxH>-<scheme>.png`. Returns the written
 * paths, relative to `root`, in capture order. Always closes the browser, even on a mid-capture
 * failure.
 */
export async function look(options) {
    const { root, screen, state, serveUrl, config, states, theme } = options;
    const playwright = await resolvePlaywright(root);
    const targetStates = state ? [state] : states;
    const outDir = path.join(root, 'design', 'screenshots');
    mkdirSync(outDir, { recursive: true });
    const written = [];
    const browser = await playwright.chromium.launch({ headless: true });
    try {
        for (const viewport of config.targets.viewports) {
            const size = parseViewport(viewport);
            for (const scheme of config.targets.schemes) {
                for (const s of targetStates) {
                    const page = await browser.newPage({ viewport: size });
                    try {
                        // D20/D22: `_theme` is the frame's own top-level search param (the frame entry reads
                        // it directly and never fetches `GET state`), distinct from the hash route's
                        // `state`/`scheme` query.
                        const themeParam = theme !== undefined ? `&_theme=${encodeURIComponent(theme)}` : '';
                        const url = `${serveUrl}/?frame=1${themeParam}#/${screen}?state=${encodeURIComponent(s)}&scheme=${encodeURIComponent(scheme)}`;
                        await page.goto(url, { waitUntil: 'networkidle' });
                        const rel = `design/screenshots/${screen}-${s}-${viewport}-${scheme}.png`;
                        await page.screenshot({ path: path.join(root, rel) });
                        written.push(rel);
                    }
                    finally {
                        await page.close?.();
                    }
                }
            }
        }
    }
    finally {
        await browser.close();
    }
    return written;
}
//# sourceMappingURL=look.js.map