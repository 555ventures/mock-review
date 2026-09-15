/** Shows the wallet balance. */
export function WalletSummary({ balance, currency }: { balance: number; currency: string }) {
  return (
    <div data-component="WalletSummary">
      {currency} {balance.toFixed(2)}
    </div>
  )
}

export const examples = {
  Default: <WalletSummary balance={128.5} currency="USD" />,
}
