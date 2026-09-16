// D6: turns the persistent `serve` dev server's own chokidar watcher into the three SSE event
// names the page listens for (`notes`, `approval`, `files`). Reuses `server.watcher` (the same
// instance Vite's HMR runs on) rather than opening a second one — `serve`'s server is created
// without `watch: null` (unlike the one-shot check runner in vite-runner.ts), so this watcher is
// alive for the whole lifetime of `serve`.
import path from 'node:path';
const FILES_DEBOUNCE_MS = 200;
/**
 * Subscribes `emit` to file changes under `cwd`: `design/notes.json` -> `notes`,
 * `design/approval.json` -> `approval`, anything under `src/` or `mock.config.ts` (D23) -> a
 * `files` event debounced at 200 ms (the Gotcha: a host's own HMR can fire a burst of `src/**`
 * events per edit). Returns a disposer that removes every listener and clears any pending
 * debounce timer.
 */
export function watchDesignFiles(server, cwd, emit) {
    const notesPath = path.join(cwd, 'design', 'notes.json');
    const approvalPath = path.join(cwd, 'design', 'approval.json');
    // D23: `mock.config.ts` also triggers a (debounced) `files` event — a config edit changes
    // `targets`/`theme`/`client` the page reads from `GET state` just like a `src/**` edit does.
    const configPath = path.join(cwd, 'mock.config.ts');
    const srcPrefix = path.join(cwd, 'src') + path.sep;
    let filesTimer;
    const scheduleFiles = () => {
        if (filesTimer)
            clearTimeout(filesTimer);
        filesTimer = setTimeout(() => {
            filesTimer = undefined;
            emit('files');
        }, FILES_DEBOUNCE_MS);
    };
    const onFsEvent = (file) => {
        if (file === notesPath) {
            emit('notes');
            return;
        }
        if (file === approvalPath) {
            emit('approval');
            return;
        }
        if (file === configPath || file.startsWith(srcPrefix)) {
            scheduleFiles();
        }
    };
    const watcher = server.watcher;
    watcher.on('change', onFsEvent);
    watcher.on('add', onFsEvent);
    watcher.on('unlink', onFsEvent);
    return () => {
        if (filesTimer)
            clearTimeout(filesTimer);
        watcher.off('change', onFsEvent);
        watcher.off('add', onFsEvent);
        watcher.off('unlink', onFsEvent);
    };
}
//# sourceMappingURL=watch.js.map