import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
function listFilesWithExt(dir, ext) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
        .map((entry) => entry.name)
        .sort();
}
function toDiscovered(relDir, names, ext) {
    return names.map((n) => ({
        name: path.basename(n, ext),
        file: `${relDir}/${n}`,
    }));
}
/**
 * D3: filesystem globbing relative to `cwd`, the host app dir. Screens/components/shells/themes
 * are read from their exact directories only (never recursive), so `src/components/ui/**` and
 * `design/examples/**` are never visited in the first place.
 */
export function discoverHost(cwd) {
    const screens = toDiscovered('src/screens', listFilesWithExt(path.join(cwd, 'src', 'screens'), '.tsx'), '.tsx');
    const components = toDiscovered('src/components', listFilesWithExt(path.join(cwd, 'src', 'components'), '.tsx'), '.tsx');
    const shells = toDiscovered('src/shells', listFilesWithExt(path.join(cwd, 'src', 'shells'), '.tsx'), '.tsx');
    const themes = toDiscovered('src/themes', listFilesWithExt(path.join(cwd, 'src', 'themes'), '.css'), '.css');
    const records = toDiscovered('src/records', listFilesWithExt(path.join(cwd, 'src', 'records'), '.ts'), '.ts');
    const journeysFile = existsSync(path.join(cwd, 'src', 'journeys.ts')) ? 'src/journeys.ts' : null;
    const configFile = existsSync(path.join(cwd, 'mock.config.ts')) ? 'mock.config.ts' : null;
    return { screens, components, shells, themes, records, journeysFile, configFile };
}
//# sourceMappingURL=discover.js.map