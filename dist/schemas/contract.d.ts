import { z } from 'zod';
/** D1: `contract --json`'s shape. Never touches the host filesystem. */
export declare const ContractSchema: z.ZodObject<{
    contractVersion: z.ZodLiteral<1>;
    package: z.ZodString;
    version: z.ZodString;
}, z.core.$strict>;
export type Contract = z.infer<typeof ContractSchema>;
//# sourceMappingURL=contract.d.ts.map