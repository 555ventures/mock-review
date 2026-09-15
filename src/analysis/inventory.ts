import path from 'node:path'
import { withCustomConfig } from 'react-docgen-typescript'
import type { InventoryRow } from '../schemas/index.js'
import { usedOn } from './imports.js'
import type { DiscoveredFile } from './discover.js'

/**
 * D11: one `react-docgen-typescript` parser built with `withCustomConfig('tsconfig.app.json', …)`
 * and one `parse([...files])` call across every discovered component and shell. `usedOn` is
 * computed from the already-collected screen import specifiers (D6/imports.ts), never from a
 * second file read.
 */
export function inventory(
  cwd: string,
  components: DiscoveredFile[],
  shells: DiscoveredFile[],
  screens: { name: string; specifiers: string[] }[],
): InventoryRow[] {
  const tsconfigPath = path.join(cwd, 'tsconfig.app.json')
  const parser = withCustomConfig(tsconfigPath, {
    savePropValueAsString: true,
    shouldExtractLiteralValuesFromEnum: true,
    propFilter: (prop) => !(prop.parent?.fileName.includes('node_modules') ?? false),
  })

  const componentAbs = components.map((c) => ({ ...c, abs: path.join(cwd, c.file) }))
  const shellAbs = shells.map((s) => ({ ...s, abs: path.join(cwd, s.file) }))
  const files = [...componentAbs, ...shellAbs].map((f) => f.abs)
  const docs = files.length > 0 ? parser.parse(files) : []

  const usedOnComponents = usedOn(
    componentAbs.map((c) => c.name),
    'components',
    screens,
  )
  const usedOnShells = usedOn(
    shellAbs.map((s) => s.name),
    'shells',
    screens,
  )

  const shellNames = new Set(shellAbs.map((s) => s.name))

  const rows: InventoryRow[] = []
  for (const doc of docs) {
    const isShell = shellNames.has(doc.displayName)
    const kind: 'component' | 'shell' = isShell ? 'shell' : 'component'
    const props: Record<string, string> = {}
    for (const [propName, propItem] of Object.entries(doc.props)) {
      props[propName] = propItem.type.name
    }

    rows.push({
      name: doc.displayName,
      kind,
      props,
      doc: doc.description,
      usedOn: (isShell ? usedOnShells : usedOnComponents)[doc.displayName] ?? [],
    })
  }

  return rows
}
