// D10/D19(c): the `answer` verb — the page's doctrine (Page Notes) says only the page ends a
// note; this CLI path is the session's half of that conversation, always attributed
// `by: "session"`. All validation (target exists, `decisions.json` — if present — parses and
// validates) happens before any write, so a refusal leaves both `notes.json` and `decisions.json`
// byte-identical (D19c).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ensureDesignFiles, readJson, writeJsonAtomic } from '../files/json.js';
import { DecisionsSchema, NotesSchema } from '../schemas/index.js';
import { fail } from './io.js';
export function answerVerb(cwd, flags) {
    ensureDesignFiles(cwd);
    const { note, journey, text, decision } = flags;
    if (text === undefined)
        fail('usage: answer (--note <id> | --journey <id>) --text <t> [--decision <d>]');
    if ((note === undefined) === (journey === undefined)) {
        fail('usage: answer requires exactly one of --note or --journey');
    }
    const notesPath = path.join(cwd, 'design', 'notes.json');
    const notes = readJson(notesPath, NotesSchema);
    let screenForDecision = null;
    let printedId;
    let target;
    if (note !== undefined) {
        const found = notes.notes.find((n) => n.id === note);
        if (!found)
            fail(`no note ${note}`);
        screenForDecision = found.screen;
        printedId = note;
        target = found;
    }
    else {
        const journeyId = journey;
        const found = notes.journeys[journeyId];
        if (!found)
            fail(`no conversation for journey ${journeyId}`);
        printedId = journeyId;
        target = found;
    }
    // D19(c): validate `decisions.json` (when present) before mutating or writing anything, so an
    // invalid file leaves notes.json (and decisions.json) byte-identical.
    const decisionsPath = path.join(cwd, 'design', 'decisions.json');
    let decisions;
    if (decision !== undefined) {
        if (existsSync(decisionsPath)) {
            try {
                decisions = readJson(decisionsPath, DecisionsSchema);
            }
            catch {
                fail('design/decisions.json is invalid');
            }
        }
        else {
            decisions = { contractVersion: 1, decisions: [] };
        }
    }
    target.status = 'answered';
    target.thread.push({ by: 'session', text });
    writeJsonAtomic(notesPath, notes);
    if (decision !== undefined && decisions) {
        decisions.decisions.push({ screen: screenForDecision, text: decision, at: new Date().toISOString() });
        writeJsonAtomic(decisionsPath, decisions);
    }
    return `answered ${printedId}`;
}
//# sourceMappingURL=answer.js.map