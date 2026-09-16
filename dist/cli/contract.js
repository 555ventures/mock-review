// D2: `contract` — the first call on every driver mark. Never imports Vite, never reads the host;
// reads only the package's own version next to `dist/`.
import { createRequire } from 'node:module';
import { ContractSchema } from '../schemas/index.js';
const require = createRequire(import.meta.url);
const PACKAGE_NAME = '@555/mock-review';
export function contractVerb() {
    // Compiled to dist/cli/contract.js; the package.json this reads is the one at the repo root,
    // two levels up from dist/cli/.
    const pkg = require('../../package.json');
    const contract = {
        contractVersion: 1,
        package: PACKAGE_NAME,
        version: pkg.version,
    };
    return ContractSchema.parse(contract);
}
//# sourceMappingURL=contract.js.map