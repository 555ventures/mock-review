import { z } from 'zod';
/** D1/File Plan: `mock.config.ts`'s default export, validated through the Vite runner (D4). */
export const ConfigSchema = z
    .object({
    name: z.string(),
    port: z.number().int(),
    targets: z
        .object({
        viewports: z.array(z.string()),
        schemes: z.array(z.string()),
    })
        .strict(),
    theme: z.string().nullable(),
    client: z
        .object({
        token: z.string(),
    })
        .strict(),
})
    .strict();
/** D6: the all-null placeholder reported alongside a `config` finding when the host's config is
 * missing, unloadable, or fails `ConfigSchema`. */
export const NullConfigSchema = z
    .object({
    name: z.null(),
    port: z.null(),
    targets: z.null(),
    theme: z.null(),
    client: z.null(),
})
    .strict();
//# sourceMappingURL=config.js.map