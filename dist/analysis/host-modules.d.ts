export type HostVite = {
    createServer: typeof import('vite').createServer;
    version: string;
};
/** `createRequire(<root>/package.json).resolve(specifier)` — resolves `specifier` exactly as the
 * host's own code would, from `root` (never from this package's files). `root`'s `package.json`
 * need not exist (D3/A10: `createRequire` only uses the path's directory for its resolution base).
 * Rethrows Node's own `MODULE_NOT_FOUND` error untouched on failure. */
export declare function resolveHostModule(root: string, specifier: string): string;
/** Resolves and imports the HOST's own `vite` (never this package's), cached per `root` (a second
 * call with the same `root` returns the exact same promise). Throws when the host's vite major is
 * not 8. Falls back to the package's own `import('vite')`, with a one-time stderr warning per
 * root, when the host has no `vite` reachable from it at all. */
export declare function loadHostVite(root?: string): Promise<HostVite>;
//# sourceMappingURL=host-modules.d.ts.map