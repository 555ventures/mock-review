/**
 * D8: `check.serve.url` — the portfile's url when `GET <url>/__mock-review/ping` answers 200
 * within 500 ms, else `null`. Any thrown error (a dead port's fetch `TypeError`, a missing or
 * unparsable portfile) counts as dead.
 */
export declare function serveUrl(cwd: string): Promise<string | null>;
//# sourceMappingURL=liveness.d.ts.map