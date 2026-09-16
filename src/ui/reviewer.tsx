// D2/reference §0.1: mounts `TooltipProvider > StoreProvider > SidebarProvider > Router`. The
// `SidebarProvider` sits above the router so the left sidebar keeps its open/closed state across
// screens.
import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TooltipProvider } from './components/ui/tooltip.js'
import { SidebarProvider } from './components/ui/sidebar.js'
import { Router } from './router/Router.js'
import { ForbiddenError, fetchState } from './sync/api.js'
import { subscribe } from './sync/events.js'
import { getStore, useStore } from './store/store.js'

/** D24: `GET state` 403s once this browser stops qualifying as `client`/loopback `owner` — most
 * often the owner rotating `config.client.token` while a client tab is still open. One line, no
 * chrome: the reference has no surface for this (spec 02 deviations sidecar). */
function ForbiddenNotice() {
  return (
    <div className="flex h-svh items-center justify-center p-6 text-center text-sm text-muted-foreground">
      This review link is no longer valid.
    </div>
  )
}

/** Fetches the initial state, subscribes to SSE and refetches on every server-side change. Not a
 * React context — the store itself is a module-level singleton (`store/store.ts`); this component
 * exists purely to run that lifecycle once, in the right place in the tree (D2's composition). */
function StoreProvider({ children }: { children: ReactNode }) {
  const forbidden = useStore((s) => s.forbidden)

  useEffect(() => {
    let cancelled = false
    fetchState()
      .then(({ seq, state }) => {
        if (!cancelled) getStore().setData(state, seq)
      })
      .catch((e) => {
        // the initial fetch failing leaves `data: null`; the page renders nothing dependent on it
        // — unless the server refused the request outright (D24), which gets its own notice.
        if (!cancelled && e instanceof ForbiddenError) getStore().setForbidden()
      })
    const unsubscribe = subscribe(() => {
      fetchState()
        .then(({ seq, state }) => {
          if (!cancelled) getStore().setData(state, seq)
        })
        .catch((e) => {
          // a transient refetch failure is not fatal — the next event tries again — but a 403
          // means the token this tab was using no longer works, and won't start working again.
          if (!cancelled && e instanceof ForbiddenError) getStore().setForbidden()
        })
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  if (forbidden) return <ForbiddenNotice />
  return children
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <TooltipProvider>
        <StoreProvider>
          <SidebarProvider>
            <Router />
          </SidebarProvider>
        </StoreProvider>
      </TooltipProvider>
    </StrictMode>,
  )
}
