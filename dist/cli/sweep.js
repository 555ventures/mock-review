// D11: the `sweep` verb — one docgen inventory pass plus the open-item queue (journeys first,
// then notes), JSON and text forms.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { discoverHost } from '../analysis/discover.js';
import { importsOf } from '../analysis/imports.js';
import { inventory } from '../analysis/inventory.js';
import { ensureDesignFiles, readJson } from '../files/json.js';
import { NotesSchema } from '../schemas/index.js';
/** The 1-based line of the first line containing `needle`, or `1` when the file is missing or the
 * needle is not found — matches D11's `<line of … or 1>` fallback. */
function lineOf(filePath, needle) {
    if (!existsSync(filePath))
        return 1;
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const idx = lines.findIndex((l) => l.includes(needle));
    return idx === -1 ? 1 : idx + 1;
}
function byFileThenId(a, b) {
    return a.file === b.file ? a.id.localeCompare(b.id) : a.file.localeCompare(b.file);
}
export function sweepVerb(cwd) {
    ensureDesignFiles(cwd);
    const discovered = discoverHost(cwd);
    const screenSpecifiers = discovered.screens.map((s) => ({
        name: s.name,
        specifiers: importsOf(path.join(cwd, s.file)),
    }));
    const inv = inventory(cwd, discovered.components, discovered.shells, screenSpecifiers);
    const notesPath = path.join(cwd, 'design', 'notes.json');
    const notes = readJson(notesPath, NotesSchema);
    const journeysFile = path.join(cwd, 'src', 'journeys.ts');
    const journeyItems = Object.entries(notes.journeys)
        .filter(([, conv]) => conv.status === 'open')
        .map(([id, conv]) => ({
        kind: 'journey',
        id,
        screen: null,
        state: null,
        file: 'src/journeys.ts',
        line: lineOf(journeysFile, `id: '${id}'`),
        last: conv.thread.at(-1)?.text ?? '',
        reuse: [],
    }))
        .sort(byFileThenId);
    const noteItems = notes.notes
        .filter((n) => n.status === 'open')
        .map((n) => {
        const file = n.screen ? `src/screens/${n.screen}.tsx` : 'src/screens/unknown.tsx';
        const line = n.component ? lineOf(path.join(cwd, file), `<${n.component}`) : 1;
        const reuse = inv.filter((row) => !row.usedOn.includes(n.screen ?? '')).map((row) => row.name);
        return {
            kind: 'note',
            id: n.id,
            screen: n.screen,
            state: n.state,
            file,
            line,
            last: n.thread.at(-1)?.text ?? '',
            reuse,
        };
    })
        .sort(byFileThenId);
    return { contractVersion: 1, inventory: inv, queue: [...journeyItems, ...noteItems] };
}
/** File Plan: text form. One line per queue item, and the queue empty case is one exact line. */
export function formatSweepText(sweep) {
    if (sweep.queue.length === 0)
        return 'queue empty\n';
    const invLines = sweep.inventory.map((row) => {
        const props = Object.entries(row.props)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
        return `${row.name} (${row.kind}) — ${row.doc} — props: ${props} — used on: ${row.usedOn.join(', ')}`;
    });
    const fileOrder = [];
    const byFile = new Map();
    for (const item of sweep.queue) {
        let bucket = byFile.get(item.file);
        if (!bucket) {
            bucket = [];
            byFile.set(item.file, bucket);
            fileOrder.push(item.file);
        }
        bucket.push(item);
    }
    const queueLines = [];
    for (const file of fileOrder) {
        queueLines.push(`## ${file}`);
        for (const item of byFile.get(file) ?? []) {
            queueLines.push(`[${item.kind}] ${item.id} ${item.screen ?? ''}/${item.state ?? ''} line ${item.line} — ${item.last} — reuse: ${item.reuse.join(', ')}`);
        }
    }
    return [...invLines, '', ...queueLines].join('\n') + '\n';
}
//# sourceMappingURL=sweep.js.map