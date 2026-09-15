// SEED copies this file to app/design/examples/records.example.ts (specs/20260914/01 D4) — a
// starting shape to copy from when writing app/src/records/<entity>.ts, never to edit in place.
// design/examples/ sits outside every contract host glob, so the reviewer never lists this as a
// real records file (AC-20260914-01-22).
export type Customer = {
  id: string
  name: string
  plan: 'starter' | 'pro'
}

// Invent every record from the seed's own Product sentences and any files under
// design/mocks/references/ — awkward cases included, since this is a mock and nobody is asked
// for data (§ Mocks: Seed).
export const customers: Customer[] = [
  { id: 'c1', name: 'Ada Lovelace', plan: 'pro' },
  { id: 'c2', name: 'Grace Hopper', plan: 'starter' },
  { id: 'c3', name: '', plan: 'starter' },
]
