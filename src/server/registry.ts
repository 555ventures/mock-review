// D6/reference §10: `GET /r/registry.json` — an in-memory shadcn-shaped registry listing the
// host's own project components (never shells, never shadcn primitives — "the registry lists
// src/components only"). Built fresh per request from `discoverHost`'s already-computed list, so
// there is nothing to keep in sync on disk.
import type { DiscoveredFile } from '../analysis/discover.js'

export type RegistryItem = {
  name: string
  type: 'registry:component'
  files: { path: string; type: 'registry:component' }[]
}

export type Registry = {
  $schema: 'https://ui.shadcn.com/schema/registry.json'
  name: string
  items: RegistryItem[]
}

/** `configName` is `config.name` when known, else `"app"` (the template's own default). */
export function buildRegistry(configName: string, components: readonly DiscoveredFile[]): Registry {
  return {
    $schema: 'https://ui.shadcn.com/schema/registry.json',
    name: configName,
    items: components.map((c) => ({
      name: c.name,
      type: 'registry:component',
      files: [{ path: c.file, type: 'registry:component' }],
    })),
  }
}
