import type { DiscoveredFile } from '../analysis/discover.js';
export type RegistryItem = {
    name: string;
    type: 'registry:component';
    files: {
        path: string;
        type: 'registry:component';
    }[];
};
export type Registry = {
    $schema: 'https://ui.shadcn.com/schema/registry.json';
    name: string;
    items: RegistryItem[];
};
/** `configName` is `config.name` when known, else `"app"` (the template's own default). */
export declare function buildRegistry(configName: string, components: readonly DiscoveredFile[]): Registry;
//# sourceMappingURL=registry.d.ts.map