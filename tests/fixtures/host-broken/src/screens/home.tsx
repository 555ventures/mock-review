import { ConsoleShell } from '@/shells/ConsoleShell'
import { Button } from '@/components/ui/button'
import { WalletSummary } from '@/components/WalletSummary'
import { customers } from '@/records/customers'
// Broken fixture (D13 red overlay): a screen may not import outside the allowed layers
// (react, @/components/ui, @/components, @/shells, @/records). AC-20260915-01-7 expects a
// `layer` finding `imports @/lib/utils` for this line.
import { cn } from '@/lib/utils'

/** The home screen: wallet summary and a link to the account screen. */
export const meta = {
  name: 'Home',
  states: ['default', 'empty'],
}

export function Home({ state = 'default' }: { state?: string }) {
  if (state === 'empty') {
    return (
      <ConsoleShell>
        <p>No wallet yet.</p>
      </ConsoleShell>
    )
  }

  return (
    <ConsoleShell>
      <WalletSummary balance={128.5} currency="USD" />
      <p className={cn('name')}>{customers[0]?.name}</p>
      <Button data-to="Account">Account</Button>
    </ConsoleShell>
  )
}

export const examples = {
  Default: <Home state="default" />,
  Empty: <Home state="empty" />,
}
