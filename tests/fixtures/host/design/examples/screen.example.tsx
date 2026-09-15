// SEED copies this file to app/design/examples/screen.example.tsx (specs/20260914/01 D4) — a
// starting shape to copy from when writing a real src/screens/*.tsx, never to edit in place.
// design/examples/ sits outside every contract host glob, so the reviewer never lists this as a
// real screen (AC-20260914-01-22). Demonstrates the four authoring rules: only allowed imports,
// a doc line plus a named `examples` export, and data drawn from records rather than literals
// (spec/skills/mock-authoring/SKILL.md).
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { customers } from './records.example'

/** Example screen: a customer list with its empty, loading and error states. */
export const meta = {
  name: 'ExampleScreen',
  states: ['default', 'empty', 'loading', 'error'],
}

export function ExampleScreen({ state = 'default' }: { state?: string }) {
  if (state === 'loading') return <p>Loading…</p>
  if (state === 'error') return <p>Something went wrong.</p>
  if (state === 'empty' || customers.length === 0) return <p>No customers yet.</p>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customers</CardTitle>
      </CardHeader>
      <CardContent>
        {customers.map((c) => (
          <div key={c.id}>{c.name || '(no name on file)'}</div>
        ))}
      </CardContent>
    </Card>
  )
}

export const examples = {
  Default: <ExampleScreen state="default" />,
  Empty: <ExampleScreen state="empty" />,
  Loading: <ExampleScreen state="loading" />,
  Error: <ExampleScreen state="error" />,
}
