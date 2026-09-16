import type { Finding } from '../schemas/index.js';
/**
 * D5 `doc` findings: a component or shell file is checked for (a) a `/** ... *\/` JSDoc comment
 * immediately above its main exported declaration (the first exported function/const that is not
 * named `meta` or `examples`), and (b) a named export `examples`. Each missing piece is its own
 * finding.
 */
export declare function docFindings(files: {
    file: string;
    abs: string;
}[]): Finding[];
//# sourceMappingURL=docs.d.ts.map