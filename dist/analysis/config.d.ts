import type { Config, Finding, NullConfig } from '../schemas/index.js';
import type { Runner } from './vite-runner.js';
export declare const NULL_CONFIG: NullConfig;
export type ConfigResult = {
    config: Config | NullConfig;
    finding?: Finding;
};
/**
 * D5/D6: loads `mock.config.ts`'s default export through the Vite runner (D4) and validates it
 * against `ConfigSchema`. Missing file, an unloadable module, or a schema failure all report the
 * all-null placeholder alongside a `config` error finding whose message is the zod pretty error's
 * first line (or a plain description when there is no zod error to pretty-print).
 */
export declare function loadConfig(cwd: string, runner: Runner): Promise<ConfigResult>;
//# sourceMappingURL=config.d.ts.map