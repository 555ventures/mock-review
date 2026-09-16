/**
 * Starts the bare reviewer server in `cwd` (D8). Ensures the design files (D9), creates the Vite
 * dev server with the mock-review plugin mounted, listens on the host's configured port
 * (falling back to Vite's default when the config can't be read), writes `design/.serve.json`,
 * and prints the resolved URL as the process's first stdout line.
 *
 * Never resolves during normal operation — `serve` runs until `SIGINT`/`SIGTERM`, at which point
 * it removes the portfile, closes the server, and exits the process with code 0.
 */
export declare function startServe(cwd: string): Promise<void>;
//# sourceMappingURL=serve.d.ts.map