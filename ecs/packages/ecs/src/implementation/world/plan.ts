// © 2026 Adobe. MIT License. See /LICENSE for details.
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
    /** By archetype id, the first row this sync point spawned into it: kept across sync points, emptied after each. */
    readonly born: Map<number, number>;
    /** By archetype id, the rows its pairs bring into it, while the sync point grows each once; all 0 between. */
    incoming: Int32Array<ArrayBuffer>;
    /** Where each entity index's entry is, or -1; reset after each sync point. */
    slots: Int32Array;
    /**
     * Archetypes a `despawnWhere` despawns every row of without an entry each, in the order planned, and by archetype id
     * whether one is: a command after it to one of their entities does nothing, as to a despawned one.
     */
    readonly cleared: number[];
    clearing: Uint8Array;
    /**
     * Commands naming rows of an archetype in row order, the same `remove`, `add` or `despawn` each, kept whole rather
     * than an entry each: `count` of them in one buffer from `command`, naming `from`'s rows from `row`, moving them to
     * `to` or despawning them. An archetype's blocks name all its rows, or are planned as entries. Their entities'
     * slots hold the block's code; a void one's commands were planned as entries.
     */
    readonly blocks: Block[];
};

export type Block = { readonly from: number; readonly to: number; readonly row: number; readonly buffer: number; readonly command: number; readonly count: number; readonly kind: number; void: boolean };

/**
 * Source and target archetype pairs, reused across sync points: `from[p]` (-1 for spawns) and `to[p]`, the number of
 * entries moving between them, and where they start in `order`, which lists every moving entry by pair, in entry order.
 * When each pair's entries are consecutive entries, as a system's spawns or moves from one archetype are, each pair
 * starts at its first entry and `order` lists entries in order.
 */
export type Pairs = {
    readonly byKey: Map<number, number>;
    readonly from: number[];
    readonly to: number[];
    readonly count: number[];
    readonly start: number[];
    /** How many pairs there are: the arrays hold the last sync point's past it. */
    length: number;
    /** Entries that leave a row, which is removed after the pairs arrive. */
    leaving: number;
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
    pairs: { byKey: new Map(), from: [], to: [], count: [], start: [], length: 0, leaving: 0, order: new Int32Array(initialEntries) },
    buffer: new Int32Array(initialEntries),
    start: new Int32Array(initialEntries),
    end: new Int32Array(initialEntries),
    more: new Map(),
    fresh: new Map(),
    born: new Map(),
    incoming: new Int32Array(0),
    slots: new Int32Array(0),
    cleared: [],
    clearing: new Uint8Array(0),
    blocks: [],
});
