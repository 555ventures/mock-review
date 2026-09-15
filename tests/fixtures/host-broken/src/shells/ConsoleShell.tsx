import type { ReactNode } from 'react'

/** The console shell with sidebar and header. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div data-component="ConsoleShell">
      <aside>Sidebar</aside>
      <header>Header</header>
      <main>{children}</main>
    </div>
  )
}

export const examples = {
  Default: (
    <ConsoleShell>
      <p>Content</p>
    </ConsoleShell>
  ),
}
