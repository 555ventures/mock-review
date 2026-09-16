// D8: the `serve` verb — a thin CLI wrapper over the server layer's persistent dev server.
import { startServe } from '../server/serve.js';
export async function serveVerb(cwd) {
    await startServe(cwd);
}
//# sourceMappingURL=serve.js.map