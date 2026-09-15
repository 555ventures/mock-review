import { ConsoleShell } from '@/shells/ConsoleShell'

/** The account screen: profile details. */
export const meta = {
  name: 'Account',
  states: ['default'],
}

export function Account() {
  return (
    <ConsoleShell>
      <h1>Account</h1>
    </ConsoleShell>
  )
}

export const examples = {
  Default: <Account />,
}
