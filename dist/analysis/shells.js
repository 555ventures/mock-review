import path from 'node:path';
/** D6: `shells[]` — the discovered shell's named `examples` keys, loaded through the Vite runner. */
export async function shellReport(cwd, runner, discovered) {
    const shells = [];
    for (const d of discovered) {
        const abs = path.join(cwd, d.file);
        let mod;
        try {
            mod = (await runner.import(abs));
        }
        catch {
            // leave mod undefined — a shell that fails to load reports no examples
        }
        shells.push({ name: d.name, file: d.file, examples: Object.keys(mod?.examples ?? {}) });
    }
    return shells;
}
//# sourceMappingURL=shells.js.map