// AC-20260915-02-13 (D6/D23): `watchDesignFiles` turns Vite's own chokidar watcher into the SSE
// event names the page listens for, and (D23) `mock.config.ts` fires a `files` event just like a
// `src/**` edit does — a config edit changes `targets`/`theme`/`client`, which `GET state`
// reports exactly like a source change. A fake watcher (a plain `EventEmitter` standing in for
// `ViteDevServer['watcher']`, the only property this module touches) makes this a true unit test:
// no real Vite server, no filesystem watching, no debounce-timing flakiness beyond vitest's own
// fake timers.
import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import type { FSWatcher, ViteDevServer } from 'vite'
import { watchDesignFiles } from '../../src/server/watch.js'

function fakeServer(): { server: ViteDevServer; watcher: EventEmitter } {
  const watcher = new EventEmitter()
  return { server: { watcher: watcher as unknown as FSWatcher } as unknown as ViteDevServer, watcher }
}

describe('AC-20260915-02-13 (D6/D23): watchDesignFiles', () => {
  it('emits notes/approval immediately for their own files, untouched by the files debounce', () => {
    const cwd = '/host'
    const { server, watcher } = fakeServer()
    const emit = vi.fn()
    const dispose = watchDesignFiles(server, cwd, emit)

    watcher.emit('change', path.join(cwd, 'design', 'notes.json'))
    expect(emit).toHaveBeenCalledWith('notes')

    watcher.emit('change', path.join(cwd, 'design', 'approval.json'))
    expect(emit).toHaveBeenCalledWith('approval')

    expect(emit).not.toHaveBeenCalledWith('files')
    dispose()
  })

  it('D23: mock.config.ts fires a debounced files event, same as a src/** edit', () => {
    vi.useFakeTimers()
    try {
      const cwd = '/host'
      const { server, watcher } = fakeServer()
      const emit = vi.fn()
      const dispose = watchDesignFiles(server, cwd, emit)

      watcher.emit('change', path.join(cwd, 'mock.config.ts'))
      expect(emit).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith('files')

      emit.mockClear()
      watcher.emit('change', path.join(cwd, 'src', 'screens', 'home.tsx'))
      vi.advanceTimersByTime(200)
      expect(emit).toHaveBeenCalledWith('files')

      dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a burst of src/** and mock.config.ts changes debounces to exactly one files event', () => {
    vi.useFakeTimers()
    try {
      const cwd = '/host'
      const { server, watcher } = fakeServer()
      const emit = vi.fn()
      const dispose = watchDesignFiles(server, cwd, emit)

      watcher.emit('change', path.join(cwd, 'src', 'screens', 'home.tsx'))
      vi.advanceTimersByTime(50)
      watcher.emit('change', path.join(cwd, 'mock.config.ts'))
      vi.advanceTimersByTime(50)
      watcher.emit('change', path.join(cwd, 'src', 'screens', 'account.tsx'))
      vi.advanceTimersByTime(200)

      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith('files')
      dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose stops further events and clears a pending debounce', () => {
    vi.useFakeTimers()
    try {
      const cwd = '/host'
      const { server, watcher } = fakeServer()
      const emit = vi.fn()
      const dispose = watchDesignFiles(server, cwd, emit)

      watcher.emit('change', path.join(cwd, 'mock.config.ts'))
      dispose()
      vi.advanceTimersByTime(500)
      expect(emit).not.toHaveBeenCalled()

      watcher.emit('change', path.join(cwd, 'design', 'notes.json'))
      expect(emit).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
