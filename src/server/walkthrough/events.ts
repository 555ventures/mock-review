// walkthrough prototype: in-process SSE fan-out, one channel per project. Replaces today's file
// watcher (src/server/watch.ts) — writes go through this process, so it emits after each write.
import { EventEmitter } from 'node:events'

export type WalkthroughEvent = 'notes' | 'approval' | 'files'

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function emit(project: string, event: WalkthroughEvent): void {
  bus.emit(project, event)
}

export function listen(project: string, fn: (event: WalkthroughEvent) => void): () => void {
  bus.on(project, fn)
  return () => {
    bus.off(project, fn)
  }
}
