// D2/reference §0.1: mounts `TooltipProvider > StoreProvider > SidebarProvider > Router`. The
// `SidebarProvider` sits above the router so the left sidebar keeps its open/closed state across
// screens.
import { StrictMode, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TooltipProvider } from './components/ui/tooltip.js'
import { SidebarProvider } from './components/ui/sidebar.js'
import { Router } from './router/Router.js'
import { Alert, AlertDescription } from './components/ui/alert.js'
import { Button } from './components/ui/button.js'
import { ForbiddenError, fetchState } from './sync/api.js'
import { subscribe } from './sync/events.js'
import { getStore, useStore } from './store/store.js'
import { ClientApp, LinkInvalid } from './client/ClientApp.js'

/** D24: `GET state` 403s once this browser stops qualifying as `client`/loopback `owner` — most
 * often the client token being rotated while a client tab is still open. Only a client link can
 * get here, so it gets the client view's own sentence (docs/design/client-view.md §6). */
function ForbiddenNotice() {
  return <LinkInvalid />
}

/** The one surface for a refusal the page can recover from: a write the server declined (with the
 * sentence it wrote for a human), or a design file on disk that does not parse — which reads to a
 * client as "my notes vanished and nothing saves", the exact symptom of a torn write. Both used to
 * be invisible. Fixed to the top of the viewport so it is seen wherever the user is scrolled; the
 * frozen reference has no surface for either, so this is a deviation on the same footing as
 * `ForbiddenNotice`. */
function Notice() {
  const notice = useStore((s) => s.notice)
  const documents = useStore((s) => s.data?.documents ?? null)
  const broken = documents
    ? [
        ...(documents.notes.ok ? [] : [`design/notes.json: ${documents.notes.error}`]),
        ...(documents.approval.ok ? [] : [`design/approval.json: ${documents.approval.error}`]),
      ]
    : []
  const text = broken.length > 0 ? broken.join(' · ') : notice
  if (!text) return null
  // An unreadable document is not dismissable — it keeps failing until the file is fixed by hand,
  // and hiding it would put the page back to lying about an empty review.
  const dismissable = broken.length === 0
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-3">
      <Alert variant="destructive" data-notice className="pointer-events-auto max-w-2xl shadow-md" role="alert">
        <AlertDescription className="flex items-center gap-3">
          <span className="flex-1">{text}</span>
          {dismissable && (
            <Button variant="ghost" size="sm" onClick={() => getStore().setNotice(null)}>
              Dismiss
            </Button>
          )}
        </AlertDescription>
      </Alert>
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
  return <>{children}</>
}

/** A `client` link gets the client view (docs/design/client-view.md), never the workbench. */
function Page() {
  const role = useStore((s) => s.data?.role ?? null)
  if (role === null) return null
  if (role === 'client') return <ClientApp />
  return (
    <>
      <Notice />
      <SidebarProvider>
        <Router />
      </SidebarProvider>
    </>
  )
}

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <TooltipProvider>
        <StoreProvider>
          <Page />
        </StoreProvider>
      </TooltipProvider>
    </StrictMode>,
  )
}
