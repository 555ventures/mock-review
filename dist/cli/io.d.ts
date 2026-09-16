export declare class CliError extends Error {
}
/** Writes `text` to `stream` and resolves only once the write callback fires (data handed to the
 * underlying fd/pipe) — the precondition D20 requires before an explicit `process.exit`. */
export declare function writeFlushed(stream: NodeJS.WritableStream, text: string): Promise<void>;
export declare function printJson(obj: unknown): Promise<void>;
export declare function fail(reason: string): never;
//# sourceMappingURL=io.d.ts.map