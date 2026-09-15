import { ConsoleShell } from '@/shells/ConsoleShell'

/** The account screen: profile details. */
export const meta = {
  name: 'Account',
  states: ['default', 'broken'],
}

// Broken fixture (D13 red overlay): a type error under src/ for AC-20260915-01-7's `type`
// finding (`TS2322: ...`).
const badCount: number = 'not a number'

export function Account({ state = 'default' }: { state?: string }) {
  if (state === 'broken') {
    // Broken fixture: this state's example throws, for AC-20260915-01-8's `render` finding
    // (`Broken: boom` — D5/D17: `<examples key>: <error.message>`).
    throw new Error('boom')
  }
  return (
    <ConsoleShell>
      <h1>Account ({badCount})</h1>
    </ConsoleShell>
  )
}

export const examples = {
  Default: <Account state="default" />,
  Broken: <Account state="broken" />,
}
