import { readFileSync } from 'node:fs';
import ts from 'typescript';
/** D5: the only import specifiers a screen file may use. */
const ALLOWED_PATTERNS = [
    /^react$/,
    /^react\//,
    /^@\/components\/ui\//,
    /^@\/components\//,
    /^@\/shells\//,
    /^@\/records\//,
];
/** Static import declarations only (multi-line safe) — no dynamic `import()` calls. */
export function importsOf(absFile) {
    const text = readFileSync(absFile, 'utf8');
    const sourceFile = ts.createSourceFile(absFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const specifiers = [];
    sourceFile.forEachChild((node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            specifiers.push(node.moduleSpecifier.text);
        }
    });
    return specifiers;
}
/** D5 `layer` findings: one per offending import specifier on a screen file. */
export function layerFindings(screens) {
    const findings = [];
    for (const screen of screens) {
        const specifiers = importsOf(screen.abs);
        for (const specifier of specifiers) {
            if (!ALLOWED_PATTERNS.some((re) => re.test(specifier))) {
                findings.push({ kind: 'layer', severity: 'error', file: screen.file, message: `imports ${specifier}` });
            }
        }
    }
    return findings;
}
/** D6 `screens[].shell`: the basename of the first `@/shells/<X>` import, or `null`. */
export function shellOf(specifiers) {
    for (const specifier of specifiers) {
        const match = /^@\/shells\/([^/]+)$/.exec(specifier);
        if (match?.[1])
            return match[1];
    }
    return null;
}
/**
 * D11 `usedOn`: for each name in `names` (component or shell basenames), the sorted screen names
 * whose import specifiers include `@/<prefix>/<name>`.
 */
export function usedOn(names, prefix, screens) {
    const result = {};
    for (const name of names)
        result[name] = [];
    const re = new RegExp(`^@/${prefix}/([^/]+)$`);
    for (const screen of screens) {
        for (const specifier of screen.specifiers) {
            const match = re.exec(specifier);
            const found = match?.[1];
            if (found !== undefined && found in result) {
                const list = result[found];
                if (list && !list.includes(screen.name))
                    list.push(screen.name);
            }
        }
    }
    for (const name of names)
        result[name]?.sort();
    return result;
}
//# sourceMappingURL=imports.js.map