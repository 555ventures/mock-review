/**
 * D7: an edge resolves when the rendered default example HTML of `steps[from].screen` contains
 * `data-to="<edge.label>"` on any element. `htmlOf` returns `undefined` when the named screen was
 * not discovered at all (unknown-screen reason) or has no renderable default HTML.
 */
export function journeyReport(journeys, htmlOf) {
    return journeys.map((journey) => {
        const unresolved = [];
        for (const edge of journey.edges) {
            if (!edge.label) {
                unresolved.push({ from: edge.from, to: edge.to, reason: 'edge has no label' });
                continue;
            }
            const step = journey.steps[edge.from];
            if (!step) {
                unresolved.push({ from: edge.from, to: edge.to, reason: `step ${edge.from} names unknown screen ` });
                continue;
            }
            const html = htmlOf(step.screen);
            if (html === undefined) {
                unresolved.push({ from: edge.from, to: edge.to, reason: `step ${edge.from} names unknown screen ${step.screen}` });
                continue;
            }
            const needle = `data-to="${edge.label}"`;
            if (!html.includes(needle)) {
                unresolved.push({
                    from: edge.from,
                    to: edge.to,
                    reason: `no control with data-to="${edge.label}" on ${step.screen}`,
                });
            }
        }
        return {
            id: journey.id,
            title: journey.title,
            steps: journey.steps,
            edges: journey.edges,
            resolved: unresolved.length === 0,
            unresolved,
        };
    });
}
//# sourceMappingURL=journeys.js.map