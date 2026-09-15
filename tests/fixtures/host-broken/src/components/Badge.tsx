// Broken fixture (D13 red overlay): no `/** ... */` doc line above the export — AC-20260915-01-7
// expects a `doc` finding `missing doc line` for this file.
export function Badge({ label }: { label: string }) {
  return <span data-component="Badge">{label}</span>
}

export const examples = {
  Default: <Badge label="New" />,
}
