export type DiscoveredFile = {
    name: string;
    file: string;
};
export type HostFiles = {
    screens: DiscoveredFile[];
    components: DiscoveredFile[];
    shells: DiscoveredFile[];
    themes: DiscoveredFile[];
    records: DiscoveredFile[];
    journeysFile: string | null;
    configFile: string | null;
};
/**
 * D3: filesystem globbing relative to `cwd`, the host app dir. Screens/components/shells/themes
 * are read from their exact directories only (never recursive), so `src/components/ui/**` and
 * `design/examples/**` are never visited in the first place.
 */
export declare function discoverHost(cwd: string): HostFiles;
//# sourceMappingURL=discover.d.ts.map