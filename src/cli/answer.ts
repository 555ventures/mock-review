// D10/D19(c): the `answer` verb — the page's doctrine (Page Notes) says only the page ends a
// note; this CLI path is the session's half of that conversation, always attributed
// `by: "session"`. All validation (target exists, `decisions.json` — if present — parses and
// validates) happens before any write, so a refusal leaves both `notes.json` and `decisions.json`
// byte-identical (D19c).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ensureDesignFiles, readDesignDoc, readJson, withDesignLock, writeJsonAtomic } from '../files/json.js'
import { CONTRACT_VERSION, DecisionsSchema } from '../schemas/index.js'
import type { Decisions, Notes, ThreadEntry } from '../schemas/index.js'
import { fail } from './io.js'

export type AnswerFlags = {
  note: string | undefined
  journey: string | undefined
  text: string | undefined
  decision: string | undefined
}

type ThreadTarget = { status: 'open' | 'answered' | 'approved' | 'deferred'; thread: ThreadEntry[] }

// D5: only `ensureDesignFiles` and the two USAGE refusals (missing `--text`, and the
// `--note`/`--journey` XOR) stay outside `withDesignLock`. Everything else — the document read,
// the target lookup (including the `no note <id>` / `no conversation for journey <id>` refusals,
// which ARE the read), the mutation, and both writes — runs inside the lock, so a refusal there
// still releases via the lock's own `finally` in `withDesignLock`.
export async function answerVerb(cwd: string, flags: AnswerFlags): Promise<string> {
  ensureDesignFiles(cwd)

  const { note, journey, text, decision } = flags

  if (text === undefined) fail('usage: answer (--note <id> | --journey <id>) --text <t> [--decision <d>]')
  if ((note === undefined) === (journey === undefined)) {
    fail('usage: answer requires exactly one of --note or --journey')
  }

  return withDesignLock(cwd, () => {
    const notesPath = path.join(cwd, 'design', 'notes.json')
    // D5: refuse rather than crash with a raw zod stack when design/notes.json exists but does not
    // parse — the shared refusal sentence, at exit 2 (mirrors sweep.ts; unlike check.ts's
    // `themeFor`, which stays silent on the same verdict).
    const notesRead = readDesignDoc(cwd, 'notes')
    if (!notesRead.ok) fail(notesRead.error)
    // `readDesignDoc`'s return type is keyed on the runtime `kind` argument, not narrowed by it —
    // the cast is safe because `kind: 'notes'` above guarantees `doc` is a `Notes`.
    const notes: Notes = notesRead.doc as Notes

    let screenForDecision: string | null = null
    let printedId: string
    let target: ThreadTarget

    if (note !== undefined) {
      const found = notes.notes.find((n) => n.id === note)
      if (!found) fail(`no note ${note}`)
      screenForDecision = found.screen
      printedId = note
      target = found
    } else {
      const journeyId = journey as string
      const found = notes.journeys[journeyId]
      if (!found) fail(`no conversation for journey ${journeyId}`)
      printedId = journeyId
      target = found
    }

    // D19(c): validate `decisions.json` (when present) before mutating or writing anything, so an
    // invalid file leaves notes.json (and decisions.json) byte-identical.
    const decisionsPath = path.join(cwd, 'design', 'decisions.json')
    let decisions: Decisions | undefined
    if (decision !== undefined) {
      if (existsSync(decisionsPath)) {
        try {
          decisions = readJson(decisionsPath, DecisionsSchema)
        } catch {
          fail('design/decisions.json is invalid')
        }
      } else {
        decisions = { contractVersion: CONTRACT_VERSION, decisions: [] }
      }
    }

    target.status = 'answered'
    target.thread.push({ by: 'session', text })
    writeJsonAtomic(notesPath, { ...notes, contractVersion: CONTRACT_VERSION })

    if (decision !== undefined && decisions) {
      decisions.decisions.push({ screen: screenForDecision, text: decision, at: new Date().toISOString() })
      writeJsonAtomic(decisionsPath, { ...decisions, contractVersion: CONTRACT_VERSION })
    }

    return `answered ${printedId}`
  })
}
