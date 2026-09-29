// D2/D6: subscribes to `GET /__mock-review/events` (SSE) and calls `onEvent` for every
// `notes` | `approval` | `files` event so the caller can refetch state. Returns an unsubscribe
// function.
import { projectBase } from './project.js'

export type ServerEvent = 'notes' | 'approval' | 'files'

export function subscribe(onEvent: (event: ServerEvent) => void): () => void {
  // U8: the project's own stream (`/p/<project>/__mock-review/events`).
  const source = new EventSource(`${projectBase()}__mock-review/events`)
  const handlers: Record<ServerEvent, (e: MessageEvent) => void> = {
    notes: () => onEvent('notes'),
    approval: () => onEvent('approval'),
    files: () => onEvent('files'),
  }
  for (const [name, handler] of Object.entries(handlers) as [ServerEvent, (e: MessageEvent) => void][]) {
    source.addEventListener(name, handler)
  }
  return () => source.close()
}
