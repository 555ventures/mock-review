import type { Finding } from '../schemas/index.js';
/** Static import declarations only (multi-line safe) — no dynamic `import()` calls. */
export declare function importsOf(absFile: string): string[];
/** D5 `layer` findings: one per offending import specifier on a screen file. */
export declare function layerFindings(screens: {
    file: string;
    abs: string;
}[]): Finding[];
/** D6 `screens[].shell`: the basename of the first `@/shells/<X>` import, or `null`. */
export declare function shellOf(specifiers: string[]): string | null;
/**
 * D11 `usedOn`: for each name in `names` (component or shell basenames), the sorted screen names
 * whose import specifiers include `@/<prefix>/<name>`.
 */
export declare function usedOn(names: string[], prefix: 'components' | 'shells', screens: {
    name: string;
    specifiers: string[];
}[]): Record<string, string[]>;
//# sourceMappingURL=imports.d.ts.map