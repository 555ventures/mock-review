// docs/design/client-view.md §2 (the new-note sheet) and §3 (reading notes and answers).
import { useState } from 'react'
import { aboutLabel, sheetTitle, type Pick } from '../notes/anchor.js'
import { Sheet } from './parts.js'
import { authorWord, isOwn, plural, statusWords, type NumberedNote } from './model.js'
import { looksRight, reply } from './actions.js'

export function NewNoteSheet({ pick, onCancel, onSave }: { pick: Pick | null; onCancel: () => void; onSave: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const title = sheetTitle(pick)
  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    const ok = await onSave(text.trim())
    setSaving(false)
    setFailed(!ok)
  }
  return (
    <Sheet label={title} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 className="cv-sheet-title">{title}</h2>
        <textarea
          className="cv-textarea"
          aria-label="What should change here?"
          placeholder="What should change here?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {failed && (
          <p className="cv-error" role="alert">
            The note was not saved. Check your connection and press Save note again.
          </p>
        )}
        <div className="cv-sheet-actions">
          <button type="button" className="cv-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="cv-btn cv-btn--ink" disabled={!text.trim() || saving}>
            Save note
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function NoteItem({ item, onLocate }: { item: NumberedNote; onLocate: (id: string) => void }) {
  const { note, number } = item
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const canClose = isOwn(note) && note.status === 'answered'

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await reply(note.id, text.trim())
    setBusy(false)
    setFailed(!ok)
    if (ok) {
      setText('')
      setReplying(false)
    }
  }
  const close = async () => {
    setBusy(true)
    const ok = await looksRight(note.id)
    setBusy(false)
    setFailed(!ok)
  }

  return (
    <li className="cv-note">
      <span className="cv-pin" aria-hidden>
        {number}
      </span>
      <div>
        <button type="button" className="cv-note-about" onClick={() => onLocate(note.id)} aria-label={`Note ${number}, ${aboutLabel(note)}. Show it on the screen.`}>
          {aboutLabel(note)}
        </button>
        <div className="cv-thread">
          {note.thread.map((entry, i) => (
            <p key={i}>
              <b>{authorWord(entry)}:</b> {entry.text}
            </p>
          ))}
        </div>
        <div className="cv-note-foot">
          <span className="cv-small cv-quiet">{statusWords(note)}</span>
          {!replying && (
            <span className="cv-btns">
              {canClose && (
                <button type="button" className="cv-btn" disabled={busy} onClick={() => void close()}>
                  Looks right
                </button>
              )}
              <button type="button" className="cv-btn" onClick={() => setReplying(true)}>
                Reply
              </button>
            </span>
          )}
        </div>
        {replying && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              className="cv-textarea"
              aria-label={`Your reply to note ${number}`}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="cv-sheet-actions">
              <button
                type="button"
                className="cv-btn"
                onClick={() => {
                  setReplying(false)
                  setText('')
                  setFailed(false)
                }}
              >
                Cancel
              </button>
              <button type="submit" className="cv-btn cv-btn--ink" disabled={!text.trim() || busy}>
                Send reply
              </button>
            </div>
          </form>
        )}
        {failed && (
          <p className="cv-error" role="alert">
            {replying ? 'The reply was not sent. Check your connection and press Send reply again.' : 'That did not go through. Check your connection and try again.'}
          </p>
        )}
      </div>
    </li>
  )
}

export function NotesSheet({ notes, onClose, onLocate }: { notes: NumberedNote[]; onClose: () => void; onLocate: (id: string) => void }) {
  const title = `${plural(notes.length, 'note', 'notes')} on this step`
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="cv-sheet-head">
        <h2 className="cv-sheet-title">{title}</h2>
        <button type="button" className="cv-btn" data-autofocus onClick={onClose}>
          Close
        </button>
      </div>
      <ol className="cv-notes">
        {notes.map((item) => (
          <NoteItem key={item.note.id} item={item} onLocate={onLocate} />
        ))}
      </ol>
    </Sheet>
  )
}
