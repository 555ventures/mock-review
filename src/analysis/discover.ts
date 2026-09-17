import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export type DiscoveredFile = { name: string; file: string }

export type HostFiles = {
  screens: DiscoveredFile[]
  components: DiscoveredFile[]
  shells: DiscoveredFile[]
  themes: DiscoveredFile[]
  records: DiscoveredFile[]
  journeysFile: string | null
  configFile: string | null
}

function listFilesWithExt(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => entry.name)
    .sort()
}

function toDiscovered(relDir: string, names: string[], ext: string): DiscoveredFile[] {
  return names.map((n) => ({
    name: path.basename(n, ext),
    file: `${relDir}/${n}`,
  }))
}

/** D1: file names (with extension) the `shadcn` vite scaffold itself writes into
 * `src/components/` — not the mock author. Remove an entry only when the scaffold stops writing
 * that file. */
const SCAFFOLD_OWNED_COMPONENTS: ReadonlySet<string> = new Set(['theme-provider.tsx'])

/**
 * D3: filesystem globbing relative to `cwd`, the host app dir. Screens/components/shells/themes
 * are read from their exact directories only (never recursive), so `src/components/ui/**` and
 * `design/examples/**` are never visited in the first place. Files the `shadcn` vite scaffold
 * writes into `src/components/` itself (not the mock author) are skipped the same way
 * `components/ui/**` is, so doc findings, the sweep inventory and the reviewer's catalog never
 * see them (D1).
 */
export function discoverHost(cwd: string): HostFiles {
  const screens = toDiscovered('src/screens', listFilesWithExt(path.join(cwd, 'src', 'screens'), '.tsx'), '.tsx')
  const components = toDiscovered(
    'src/components',
    listFilesWithExt(path.join(cwd, 'src', 'components'), '.tsx').filter((n) => !SCAFFOLD_OWNED_COMPONENTS.has(n)),
    '.tsx',
  )
  const shells = toDiscovered('src/shells', listFilesWithExt(path.join(cwd, 'src', 'shells'), '.tsx'), '.tsx')
  const themes = toDiscovered('src/themes', listFilesWithExt(path.join(cwd, 'src', 'themes'), '.css'), '.css')
  const records = toDiscovered('src/records', listFilesWithExt(path.join(cwd, 'src', 'records'), '.ts'), '.ts')

  const journeysFile = existsSync(path.join(cwd, 'src', 'journeys.ts')) ? 'src/journeys.ts' : null
  const configFile = existsSync(path.join(cwd, 'mock.config.ts')) ? 'mock.config.ts' : null

  return { screens, components, shells, themes, records, journeysFile, configFile }
}
