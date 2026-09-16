import type { Journey } from '../schemas/index.js';
export type JourneyInput = {
    id: string;
    title: string;
    steps: {
        screen: string;
    }[];
    edges: {
        from: number;
        to: number;
        label?: string;
    }[];
};
/**
 * D7: an edge resolves when the rendered default example HTML of `steps[from].screen` contains
 * `data-to="<edge.label>"` on any element. `htmlOf` returns `undefined` when the named screen was
 * not discovered at all (unknown-screen reason) or has no renderable default HTML.
 */
export declare function journeyReport(journeys: JourneyInput[], htmlOf: (screenName: string) => string | undefined): Journey[];
//# sourceMappingURL=journeys.d.ts.map