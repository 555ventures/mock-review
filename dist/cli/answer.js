// D10/D19(c): the `answer` verb — the page's doctrine (Page Notes) says only the page ends a
// note; this CLI path is the session's half of that conversation, always attributed
// `by: "session"`. All validation (target exists, patch parses) happens before any write, so a
// refusal leaves `notes.json` byte-identical (D19c).
// D3 (04-contract-v3): `design/decisions.json` and `--decision` are retired — the CLI no longer
// reads, validates, or writes a decisions document. `src/cli.ts`'s `answer` branch refuses
// `--decision` explicitly before this verb is ever called.
import path from 'node:path';
import { ensureDesignFiles, readDesignDoc, withDesignLock, writeJsonAtomic } from '../files/json.js';
import { CONTRACT_VERSION } from '../schemas/index.js';
import { NotesPatchSchema } from '../schemas/patches.js';
import { applyNotesPatch } from '../server/patches.js';
import { fail } from './io.js';
// D5: only `ensureDesignFiles` and the two USAGE refusals (missing `--text`, and the
// `--note`/`--journey` XOR) stay outside `withDesignLock`. Everything else — the document read,
// the target lookup (including the `no note <id>` / `no conversation for journey <id>` refusals,
// which ARE the read), the mutation, and the write — runs inside the lock, so a refusal there
// still releases via the lock's own `finally` in `withDesignLock`.
export async function answerVerb(cwd, flags) {
    ensureDesignFiles(cwd);
    const { note, journey, text } = flags;
    if (text === undefined)
        fail('usage: answer (--note <id> | --journey <id>) --text <t>');
    if ((note === undefined) === (journey === undefined)) {
        fail('usage: answer requires exactly one of --note or --journey');
    }
    return withDesignLock(cwd, () => {
        const notesPath = path.join(cwd, 'design', 'notes.json');
        // D5: refuse rather than crash with a raw zod stack when design/notes.json exists but does not
        // parse — the shared refusal sentence, at exit 2 (mirrors sweep.ts; unlike check.ts's
        // `themeFor`, which stays silent on the same verdict).
        const notesRead = readDesignDoc(cwd, 'notes');
        if (!notesRead.ok)
            fail(notesRead.error);
        // `readDesignDoc`'s return type is keyed on the runtime `kind` argument, not narrowed by it —
        // the cast is safe because `kind: 'notes'` above guarantees `doc` is a `Notes`.
        const notes = notesRead.doc;
        let printedId;
        let targetId;
        // D6: `answer` has no Vite and cannot ask whether a journey id is real (unlike `POST notes`,
        // which can seed a default conversation for one) — a journey target must already have a
        // conversation, as before. A note or journey missing here still fails exactly as before.
        if (note !== undefined) {
            const found = notes.notes.find((n) => n.id === note);
            if (!found)
                fail(`no note ${note}`);
            printedId = note;
            targetId = note;
        }
        else {
            const journeyId = journey;
            const found = notes.journeys[journeyId];
            if (!found)
                fail(`no conversation for journey ${journeyId}`);
            printedId = journeyId;
            targetId = journeyId;
        }
        // D6: builds the same wire shape the page sends and parses it through the shared
        // `NotesPatchSchema`, so `ReplyEntrySchema.text`'s trim/non-empty rule applies to the CLI
        // exactly as it does to a browser reply — a whitespace-only `--text` refuses here too.
        const parsedPatch = NotesPatchSchema.safeParse({
            op: 'reply',
            id: targetId,
            entry: { by: 'session', text },
        });
        if (!parsedPatch.success)
            fail('invalid notes patch');
        const patch = parsedPatch.data;
        // D6/D7: the reducer decides status from attribution — `by:'session'` always resolves to
        // `answered`, so rule 6 (un-approve on reopen) can never fire here; `answer` never reads or
        // writes `design/approval.json`. `withDesignLock`'s own lock is this call's serialization —
        // `applyNotesPatch` is the shared reducer both the page and the CLI now go through (D6).
        const result = applyNotesPatch(notes, patch);
        writeJsonAtomic(notesPath, { ...result.notes, contractVersion: CONTRACT_VERSION });
        return `answered ${printedId}`;
    });
}
//# sourceMappingURL=answer.js.map