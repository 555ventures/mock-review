import path from 'node:path'
import type { Shell } from '../schemas/index.js'
import type { Runner } from './vite-runner.js'
import type { DiscoveredFile } from './discover.js'

type ShellModule = { examples?: Record<string, unknown> }

/** D6: `shells[]` — the discovered shell's named `examples` keys, loaded through the Vite runner. */
export async function shellReport(cwd: string, runner: Runner, discovered: DiscoveredFile[]): Promise<Shell[]> {
  const shells: Shell[] = []

  for (const d of discovered) {
    const abs = path.join(cwd, d.file)
    let mod: ShellModule | undefined
    try {
      mod = (await runner.import(abs)) as ShellModule
    } catch {
      // leave mod undefined — a shell that fails to load reports no examples
    }
    shells.push({ name: d.name, file: d.file, examples: Object.keys(mod?.examples ?? {}) })
  }

  return shells
}
