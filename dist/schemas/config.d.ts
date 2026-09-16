import { z } from 'zod';
/** D1/File Plan: `mock.config.ts`'s default export, validated through the Vite runner (D4). */
export declare const ConfigSchema: z.ZodObject<{
    name: z.ZodString;
    port: z.ZodNumber;
    targets: z.ZodObject<{
        viewports: z.ZodArray<z.ZodString>;
        schemes: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    theme: z.ZodNullable<z.ZodString>;
    client: z.ZodObject<{
        token: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
export type Config = z.infer<typeof ConfigSchema>;
/** D6: the all-null placeholder reported alongside a `config` finding when the host's config is
 * missing, unloadable, or fails `ConfigSchema`. */
export declare const NullConfigSchema: z.ZodObject<{
    name: z.ZodNull;
    port: z.ZodNull;
    targets: z.ZodNull;
    theme: z.ZodNull;
    client: z.ZodNull;
}, z.core.$strict>;
export type NullConfig = z.infer<typeof NullConfigSchema>;
//# sourceMappingURL=config.d.ts.map