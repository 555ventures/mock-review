export function parseArgs(argv) {
    let verb;
    let json = false;
    const values = {};
    const flags = new Set();
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === undefined)
            continue;
        if (token === '--json') {
            json = true;
            continue;
        }
        if (token.startsWith('--')) {
            const name = token.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                values[name] = next;
                i++;
            }
            else {
                flags.add(name);
            }
            continue;
        }
        if (verb === undefined)
            verb = token;
    }
    return { verb, json, values, flags };
}
//# sourceMappingURL=args.js.map