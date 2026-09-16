// D2/D20: every JSON verb writes exactly one `JSON.stringify(result) + "\n"` to stdout and
// nothing else; every diagnostic (including a refusal) goes to stderr as `mock-review: <reason>`,
// exit 2. `fail` throws rather than calling `process.exit` directly so callers (Vite servers,
// open file handles) get a chance to be caught and the dispatcher can print a clean, single
// stderr line. D20: a one-shot verb's output must be *flushed* — its write callback fired — before
// the process exits explicitly, because a handle that survives `server.close()` (Vite's watcher or
// similar) can otherwise keep the event loop alive indefinitely with `process.exitCode` alone.
export class CliError extends Error {
}
/** Writes `text` to `stream` and resolves only once the write callback fires (data handed to the
 * underlying fd/pipe) — the precondition D20 requires before an explicit `process.exit`. */
export function writeFlushed(stream, text) {
    return new Promise((resolve, reject) => {
        stream.write(text, (err) => (err ? reject(err) : resolve()));
    });
}
export function printJson(obj) {
    return writeFlushed(process.stdout, JSON.stringify(obj) + '\n');
}
export function fail(reason) {
    throw new CliError(reason);
}
//# sourceMappingURL=io.js.map