import { ConsoleShell } from '@/shells/ConsoleShell'
import { Button } from '@/components/ui/button'
import { WalletSummary } from '@/components/WalletSummary'
import { customers } from '@/records/customers'

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
      <p>{customers[0]?.name}</p>
      <Button data-to="Account">Account</Button>
    </ConsoleShell>
  )
}

export const examples = {
  Default: <Home state="default" />,
  Empty: <Home state="empty" />,
}
