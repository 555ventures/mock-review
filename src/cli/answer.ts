// D10: the `answer` verb — the page's doctrine (Page Notes) says only the page ends a note; this
// CLI path is the session's half of that conversation, always attributed `by: "session"`.
import path from 'node:path'
import { ensureDesignFiles, readJson, writeJsonAtomic } from '../files/json.js'
import { DecisionsSchema, NotesSchema } from '../schemas/index.js'
import type { Decisions } from '../schemas/index.js'
import { fail } from './io.js'

export type AnswerFlags = {
  note: string | undefined
  journey: string | undefined
  text: string | undefined
  decision: string | undefined
}

export function answerVerb(cwd: string, flags: AnswerFlags): string {
  ensureDesignFiles(cwd)

  const { note, journey, text, decision } = flags

  if (text === undefined) fail('usage: answer (--note <id> | --journey <id>) --text <t> [--decision <d>]')
  if ((note === undefined) === (journey === undefined)) {
    fail('usage: answer requires exactly one of --note or --journey')
  }

  const notesPath = path.join(cwd, 'design', 'notes.json')
  const notes = readJson(notesPath, NotesSchema)

  let screenForDecision: string | null = null
  let printedId: string

  if (note !== undefined) {
    const target = notes.notes.find((n) => n.id === note)
    if (!target) fail(`no note ${note}`)
    target.status = 'answered'
    target.thread.push({ by: 'session', text })
    screenForDecision = target.screen
    printedId = note
  } else {
    const journeyId = journey as string
    const target = notes.journeys[journeyId]
    if (!target) fail(`no conversation for journey ${journeyId}`)
    target.status = 'answered'
    target.thread.push({ by: 'session', text })
    printedId = journeyId
  }

  writeJsonAtomic(notesPath, notes)

  if (decision !== undefined) {
    const decisionsPath = path.join(cwd, 'design', 'decisions.json')
    let decisions: Decisions
    try {
      decisions = readJson(decisionsPath, DecisionsSchema)
    } catch {
      decisions = { contractVersion: 1, decisions: [] }
    }
    decisions.decisions.push({ screen: screenForDecision, text: decision, at: new Date().toISOString() })
    writeJsonAtomic(decisionsPath, decisions)
  }

  return `answered ${printedId}`
}
