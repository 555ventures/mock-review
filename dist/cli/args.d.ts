export type ParsedArgs = {
    verb: string | undefined;
    json: boolean;
    values: Record<string, string>;
    flags: Set<string>;
};
export declare function parseArgs(argv: string[]): ParsedArgs;
//# sourceMappingURL=args.d.ts.map