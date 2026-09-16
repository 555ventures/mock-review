/** `configName` is `config.name` when known, else `"app"` (the template's own default). */
export function buildRegistry(configName, components) {
    return {
        $schema: 'https://ui.shadcn.com/schema/registry.json',
        name: configName,
        items: components.map((c) => ({
            name: c.name,
            type: 'registry:component',
            files: [{ path: c.file, type: 'registry:component' }],
        })),
    };
}
//# sourceMappingURL=registry.js.map