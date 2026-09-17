// D3: the one place `src/` resolves a module from the HOST root rather than the package's own
// `node_modules`. `loadHostVite` is why the package never runs a second, physically distinct copy
// of Vite beside the host's own — see docs/canonical/package.md "The reviewer page" and spike S7
// (specs/20260916/02-one-vite-per-host.md). `resolveHostModule` is shared with
// `src/analysis/look.ts`'s `playwright` resolution (D8) so the two optional/peer resolutions never
// drift apart.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
/** `createRequire(<root>/package.json).resolve(specifier)` — resolves `specifier` exactly as the
 * host's own code would, from `root` (never from this package's files). `root`'s `package.json`
 * need not exist (D3/A10: `createRequire` only uses the path's directory for its resolution base).
 * Rethrows Node's own `MODULE_NOT_FOUND` error untouched on failure. */
export function resolveHostModule(root, specifier) {
    const require = createRequire(path.join(root, 'package.json'));
    return require.resolve(specifier);
}
const hostViteCache = new Map();
async function loadHostViteUncached(root) {
    let vitePackageJsonPath;
    try {
        vitePackageJsonPath = resolveHostModule(root, 'vite/package.json');
    }
    catch (err) {
        const code = err.code;
        if (code !== 'MODULE_NOT_FOUND')
            throw err;
        process.stderr.write(`mock-review: vite is not resolvable from ${root}; using the package's own copy\n`);
        return (await import('vite'));
    }
    const pkg = JSON.parse(readFileSync(vitePackageJsonPath, 'utf8'));
    const viteVersion = pkg.version;
    if (Number(viteVersion.split('.')[0]) !== 8) {
        throw new Error(`mock-review needs vite 8 in the host; found vite ${viteVersion} at ${path.dirname(vitePackageJsonPath)}`);
    }
    const viteEntry = resolveHostModule(root, 'vite');
    const mod = (await import(pathToFileURL(viteEntry).href));
    return { createServer: mod.createServer, version: viteVersion };
}
/** Resolves and imports the HOST's own `vite` (never this package's), cached per `root` (a second
 * call with the same `root` returns the exact same promise). Throws when the host's vite major is
 * not 8. Falls back to the package's own `import('vite')`, with a one-time stderr warning per
 * root, when the host has no `vite` reachable from it at all. */
export function loadHostVite(root = process.cwd()) {
    const cached = hostViteCache.get(root);
    if (cached)
        return cached;
    const promise = loadHostViteUncached(root);
    hostViteCache.set(root, promise);
    return promise;
}
//# sourceMappingURL=host-modules.js.map