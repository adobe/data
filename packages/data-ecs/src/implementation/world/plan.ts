/**
 * A sync point's plan: each touched entity's net change, as reusable parallel arrays rather than an object per entity.
 * `to` is where it ends up; its values are command ranges, applied in issue order so later values win. Each world has
 * its own, since a sync point can wait for the GPU between planning and applying.
 */
export type Plan = {
    count: number;
    /** Entries made by spawns; each consumed one reservation. */
    spawned: number;
    /** Commands that did nothing, since their entity wasn't alive. */
    dropped: number;
    entity: Float64Array<ArrayBuffer>;
    /** Archetype id, or -1 for an entity spawned in this sync point. */
    from: Int32Array<ArrayBuffer>;
    to: Int32Array<ArrayBuffer>;
    despawned: Uint8Array<ArrayBuffer>;
    /** While applying: the row an entity leaves in `from`, kept current as rows swap into holes; -1 for none. */
    row: Int32Array<ArrayBuffer>;
    /** While applying: the pair of archetypes a moving entry is in, by index into the pairs; -1 for one staying. */
    pair: Int32Array<ArrayBuffer>;
    /** While applying: the pairs of source and target archetype entries move between, by key, with their entries in order. */
    readonly pairs: Pairs;
    /** The first command range: queued buffer, start and end. Most entities have one. */
    buffer: Int32Array<ArrayBuffer>;
    start: Int32Array<ArrayBuffer>;
    end: Int32Array<ArrayBuffer>;
    /** Further ranges, as buffer, start, end triples. */
    readonly more: Map<number, number[]>;
    /** Components removed and added again here, so their `added` tick is new although `from` had them. */
    readonly fresh: Map<number, number[]>;
    /** Where each entity index's entry is, or -1; reset after each sync point. */
    slots: Int32Array;
    /**
     * Spawns in a batch usually name the same few sets of components: the last eight id sequences and their target
     * archetypes, replaced round-robin, so most spawns skip walking archetype edges.
     */
    readonly shapes: { ids: Int32Array; start: number; end: number; target: number }[];
};

/**
 * Source and target archetype pairs, reused across sync points: `from[p]` (-1 for spawns) and `to[p]`, the number of
 * entries moving between them, and where they start in `order`, which lists every moving entry by pair, in entry order.
 */
export type Pairs = {
    readonly byKey: Map<number, number>;
    readonly from: number[];
    readonly to: number[];
    readonly count: number[];
    readonly start: number[];
    order: Int32Array<ArrayBuffer>;
};

const initialEntries = 64;

export const createPlan = (): Plan => ({
    count: 0,
    spawned: 0,
    dropped: 0,
    entity: new Float64Array(initialEntries),
    from: new Int32Array(initialEntries),
    to: new Int32Array(initialEntries),
    despawned: new Uint8Array(initialEntries),
    row: new Int32Array(initialEntries),
    pair: new Int32Array(initialEntries),
    pairs: { byKey: new Map(), from: [], to: [], count: [], start: [], order: new Int32Array(initialEntries) },
    buffer: new Int32Array(initialEntries),
    start: new Int32Array(initialEntries),
    end: new Int32Array(initialEntries),
    more: new Map(),
    fresh: new Map(),
    slots: new Int32Array(0),
    shapes: Array.from({ length: 8 }, () => ({ ids: new Int32Array(0), start: 0, end: 0, target: -1 })),
});
