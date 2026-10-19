import { createHolds, type Holds } from './stop-lists.js';
import type { Entity } from '../../interface/entity/entity.js';
import { declarationOf, firstKeyOf, kindOf, labelOf } from '../../interface/registry/index.js';
import { createArchetype, startTicks, type Archetype, type Storage } from './archetype.js';
import type { SpawnBatch } from './staging.js';
import type { CommandBuffer } from './buffer.js';
import type { ListShape, Recent } from './lists.js';
import type { Directory } from './directories.js';
import type { GpuEngine } from './gpu.js';
import type { Queued } from './synchronize.js';
import type { IndexChanges } from './cascade.js';
import { createEntities, type Entities, type Reserved } from './entities.js';
import type { FinalizerRunner, Thrown } from './finalizers.js';
import { createPlan, type Plan } from './plan.js';
import { createStructure, owner, restratify, weak, type Structure } from './structure.js';
import { layoutOf, type Layout } from '../../interface/registry/layout.js';
import { createMemory, type Memory } from './memory.js';
import { createLayoutDirectory, type LayoutDirectory } from './layout-directory.js';
import { createJournal, type Journal } from './journal.js';
import type { Row } from './rows.js';
import type { MoveLog } from './move-log.js';
import type { TaskChannel } from './remote-systems.js';
import type { Tail } from './tails.js';
import { claimComponent } from './remote.js';
import type { IndexDefinition } from '../../interface/registry/index.js';
import type { WorldIndex } from './indexes.js';
import type { Failure } from '../../interface/world/report.js';

export type Key = string | symbol;

/** Everything a world stores. Components and resources share ids; resources live on `resourceEntity`. */
export type State = {
    readonly memory: Memory;
    readonly entities: Entities;
    readonly archetypes: Archetype[];
    /** Archetypes created or bumped since the layout directory's last flush. */
    readonly bumped: Archetype[];
    /** How many times any archetype's arrays were replaced: rows bound to them are current while it stays the same. */
    readonly replaced: { count: number };
    /** Where other threads find archetypes and the entity table in the shared memory; null without shared memory. */
    readonly directory: LayoutDirectory | null;
    readonly archetypeByKey: Map<string, Archetype>;
    readonly ids: Map<Key, number>;
    readonly keys: Key[];
    readonly layouts: Layout[];
    /** Whether each component is derived, so only rules add and remove it. */
    readonly derived: boolean[];
    /** Whether each component is declared `transfer`, so a value whose command drops is released; and whether any is. */
    readonly transfers: boolean[];
    transferring: boolean;
    readonly resources: Set<number>;
    /** The newest tick handed out. Systems and sync points each take the next one. */
    tick: number;
    /** By component id: the tick of the last sync point that wrote a reference into it. */
    readonly referencesWritten: number[];
    /** The entities sync points spawned, despawned, moved or wrote references of, for `up` systems and query observers. */
    readonly journal: Journal;
    /** Command buffers for the next sync point, in merge order. */
    readonly queued: Queued[];
    /** Buffers that workers' command ring segments drain into, the first `drained` in use until the sync point's end. */
    readonly drains: CommandBuffer[];
    drained: number;
    resourceEntity: number;
    /**
     * Components some registered system filters on with `changed`, or an entity or query observer watches; only their
     * kernel stamps are kept. By component id, how many do: each system while registered, each observer's watch for the
     * world's life (`observe`).
     */
    readonly observed: Set<number>;
    readonly observedCounts: number[];
    /** Workers' kernel indexes, by kernel module url, so they're bounded by code. */
    readonly kernelIndexes: Map<string, number>;
    /** Components some registered system filters on with `added` or `changed`, or an entity or query observer watches; only they keep ticks. */
    readonly ticked: Set<number>;
    /** Main-thread spawns since the last sync point, by component set. */
    readonly batches: SpawnBatch[];
    readonly batchByKey: Map<string, SpawnBatch>;
    /**
     * Lists of components commands named, by their sorted ids; archetypes by their program-wide index, and the last
     * eight plain lists, which find them first.
     */
    readonly lists: Map<string, readonly ListShape[]>;
    readonly byIndex: ListShape[];
    /** Every list shape, by its index. */
    readonly shapes: ListShape[];
    readonly recent: Recent[];
    nextRecent: number;
    /** By component id: whether commands may name it, once a command has. */
    readonly commandable: boolean[];
    /** By component id: what it starts at when a spawn or add leaves it out. */
    readonly starts: unknown[];
    /** Lookup directories for WASM kernels, kept up to date at sync points. */
    readonly directories: Set<Directory>;
    /** Workers the world may run kernels on; with none, kernels run on the main thread. */
    workers: number;
    /**
     * Called at the end of each sync point, to size what depends on archetypes, such as reduction partials: each
     * registered runner's hook, held weakly, so the runner lives only as long as its system.
     */
    readonly afterSync: Set<WeakRef<() => void>>;
    /** Accessor rows for main-thread systems, by the component ids they read and write. */
    readonly rows: Map<string, Row>;
    /** Whether kernels with a program run as WASM, and as SIMD where they can; tests turn these off to compare with JS. */
    readonly wasm: boolean;
    readonly simd: boolean;
    /** The sync point's plan, kept from planning to applying. */
    readonly plan: Plan;
    /** A sync point between planning and applying: its queued buffers, reservations and tick. */
    syncing: {
        readonly queued: readonly Queued[];
        readonly reservations: Reserved;
        /** The entity table's length once they were made. */
        readonly reserved: number;
        readonly tick: number;
        /** By batch target archetype id, the first row its batches added. */
        readonly born: Map<number, number>;
        readonly index: IndexChanges | null;
        /** Whether rules or `within` declarations can change archetypes. */
        readonly deriving: boolean;
        /** Applies only its queued buffers, for registration's own changes. */
        readonly isolated: boolean;
        /** Reservations returned unused, which no spawn consumes. */
        readonly unreserved: number;
    } | null;
    /** Reservation positions blocks left unused since the last sync point, as start and end pairs. */
    readonly unused: number[];
    /** Reservations made during the last sync point's finalizers, which the next one accounts for. */
    carried: Reserved | null;
    /** While finalizers run: by batch target archetype id, the first row its batches added this sync point, which lookups don't see. */
    born: Map<number, number> | null;
    readonly structure: Structure;
    /** The program's finalizers this world has activated, in their order. */
    readonly finalizers: FinalizerRunner[];
    /** The program's rules and finalizers active here, which apply from the first sync point after the world meets their components. */
    readonly activated: Set<object>;
    /** The program's version when the world last activated, and whether it has met a component since. */
    activation: { version: number; met: boolean };
    /** Resource values given at creation, in place of their defaults. */
    readonly initial: Map<Key, unknown>;
    /** The world's GPU, where render systems and GPU kernels run. */
    gpu: GpuEngine | null;
    /** With a GPU: archetypes the current sync point changed, whose GPU copies are then out of date. */
    touched: Set<Archetype> | null;
    /** By component id: the log of the joined thread filling its objects (`remote.ts`). */
    readonly remote: (MoveLog | undefined)[];
    /** Logical threads joined threads claim, by their logs; the logs; and whether there are any. */
    readonly claims: Map<string, MoveLog>;
    readonly logs: MoveLog[];
    claimed: boolean;
    /** While a joined thread may read them: archetypes whose count changed since the layout directory's last flush. */
    readonly counted: Archetype[];
    /** By logical thread a joined thread claims, its task channel, which systems placed there run through; and every channel. */
    readonly threadTasks: Map<string, TaskChannel>;
    readonly channels: TaskChannel[];
    /** Moves on whenever systems are placed again, as claims are made or released. */
    placement: number;
    /** Moves on whenever a registered system's runner is replaced, so runs read runners again only then. */
    runnersVersion: number;
    /**
     * Failures of finalizers the next sync point reports: those on claimed threads that can't run there, which don't
     * activate, with every one found; and stops a thread that's gone never finalized.
     */
    readonly unplaced: Thrown[];
    readonly unplacedSeen: Set<object>;
    /**
     * Indexes of entities despawned with stops of joined threads' finalizers, held apart from `released` until those
     * threads acknowledge them.
     */
    readonly holds: Holds;
    /** Tails posted whose reads a later writer must still copy, or wait for (`tails.ts`). */
    readonly tails: Tail[];
    /** The indexes some registered system or finalizer uses, by declaration (`indexes.ts`). */
    readonly indexes: Map<IndexDefinition, WorldIndex>;
    /** By component id: the tick of the last system run that wrote it, which indexes read to skip ticks no write moved. */
    readonly written: number[];
    /** The tick of the last sync point that wrote a command's value into a row. */
    valuesWritten: number;
    /** Unique indexes' conflicts refreshes found, for the report of the run in progress. */
    readonly indexFailures: Failure[];
    /** Indexes built in phases so far, and of them across the pool, for tests of how builds run. */
    phasedBuilds: number;
    pooledBuilds: number;
    /** Components finalizers' indexes follow since the last run, whose ticks and kernels' stamps start before the next. */
    readonly watchesPending: number[];
};

export const createState = (shared?: boolean, wasm = true, simd = true, gpu = false, initial: Map<Key, unknown> = new Map()): State => {
    const memory = createMemory(shared);
    return {
        memory,
        entities: createEntities(memory),
        archetypes: [],
        bumped: [],
        replaced: { count: 0 },
        directory: createLayoutDirectory(memory),
        archetypeByKey: new Map(),
        ids: new Map(),
        keys: [],
        layouts: [],
        derived: [],
        transfers: [],
        transferring: false,
        resources: new Set(),
        tick: 0,
        queued: [],
        drains: [],
        drained: 0,
        resourceEntity: -1,
        observed: new Set(),
        observedCounts: [],
        kernelIndexes: new Map(),
        referencesWritten: [],
        journal: createJournal(),
        ticked: new Set(),
        batches: [],
        batchByKey: new Map(),
        unused: [],
        lists: new Map(),
        byIndex: [],
        shapes: [],
        recent: [],
        nextRecent: 0,
        commandable: [],
        starts: [],
        directories: new Set(), workers: 0, afterSync: new Set(),
        rows: new Map(),
        wasm,
        simd,
        plan: createPlan(),
        syncing: null,
        carried: null,
        born: null,
        structure: createStructure(),
        finalizers: [],
        activated: new Set(),
        activation: { version: -1, met: true },
        initial,
        gpu: null,
        touched: gpu ? new Set() : null,
        remote: [],
        claims: new Map(),
        logs: [],
        claimed: false,
        counted: [],
        threadTasks: new Map(),
        channels: [],
        placement: 0,
        runnersVersion: 0,
        unplaced: [],
        unplacedSeen: new Set(),
        holds: createHolds(),
        tails: [],
        indexes: new Map(),
        written: [],
        valuesWritten: 0,
        indexFailures: [],
        phasedBuilds: 0,
        pooledBuilds: 0,
        watchesPending: [],
    };
};

/** Counts one more system or observer watching a component's changes, so kernels keep its stamps. */
export const observe = (state: State, id: number): void => {
    state.observedCounts[id] = (state.observedCounts[id] ?? 0) + 1;
    state.observed.add(id);
};

/** Counts one fewer; kernels that muted its stamps before keep them until they load again for another reason. */
export const unobserve = (state: State, id: number): void => {
    const count = (state.observedCounts[id] ?? 0) - 1;
    state.observedCounts[id] = count;
    if (count <= 0) state.observed.delete(id);
};

/** The id of a component or resource the world has met, or undefined. */
export const metIdOf = (state: State, key: Key): number | undefined => state.ids.get(key) ?? state.ids.get(firstKeyOf(key));

/** Components whose hosts are being resolved, to report a cycle of `within` declarations. */
const resolving = new Set<Key>();

/** The id of a component or resource. Throws if it has no registered schema. */
export const idOf = (state: State, key: Key): number => {
    const existing = state.ids.get(key);
    if (existing !== undefined) return existing;
    // Symbols registered under one id are one component, by the first of them.
    const first = firstKeyOf(key);
    if (first !== key) {
        const id = idOf(state, first);
        state.ids.set(key, id);
        return id;
    }
    const declaration = declarationOf(key);
    if (declaration === undefined) throw new Error(`"${labelOf(key)}" has no registered schema; import the module that registers it.`);
    const { structure } = state;
    // A host gets its id first, so stratifying with the new edge can name it; a cycle throws before anything is recorded.
    const within = declaration.within;
    let host = -1;
    if (typeof within === "symbol") {
        if (resolving.has(key)) throw new Error(`Components are within each other in a cycle: ${[...resolving].map(labelOf).sort().join(", ")}.`);
        resolving.add(key);
        try {
            host = idOf(state, within);
        }
        finally {
            resolving.delete(key);
        }
    }
    const id = state.keys.length;
    if (host >= 0) {
        const hosts = [...structure.hosts];
        hosts[id] = host;
        restratify(structure, structure.rules, hosts, other => labelOf(other === id ? key : state.keys[other]));
    }
    state.ids.set(key, id);
    state.keys.push(key);
    const layout = layoutOf(declaration.type);
    state.layouts.push(layout);
    state.starts.push(layout.kind === "constant" ? layout.value : defaultOf(key));
    state.commandable.push(false);
    state.written.push(0);
    state.derived.push(declaration.derived === true);
    state.transfers.push(declaration.transfer === true);
    if (declaration.transfer === true) state.transferring = true;
    structure.hosts[id] = host;
    structure.dependents[id] = [];
    if (host >= 0) structure.dependents[host].push(id);
    structure.references[id] = declaration.reference === "owner" ? owner : declaration.reference === "weak" ? weak : 0;
    if (structure.references[id] !== 0) structure.referenceIds.push(id);
    if (kindOf(key) === "resource") state.resources.add(id);
    state.activation.met = true;
    if (state.claimed) claimComponent(state, id);
    return id;
};

/**
 * What a resource or derived component starts at: its declaration's default or its schema's, or `null` when its type
 * allows leaving it out.
 */
export const defaultOf = (key: Key): unknown => {
    const declaration = declarationOf(key);
    if (declaration === undefined) return null;
    if ("default" in declaration) return declaration.default;
    const { type } = declaration;
    return type !== undefined && "default" in type ? type.default : null;
};

/**
 * The id of a component a command names. Throws for a key that isn't a symbol, isn't registered, or is a resource,
 * for a derived component, which only rules add and remove, and for one only the world writes.
 */
export const commandIdOf = (state: State, key: unknown): number => {
    const known = typeof key === "symbol" ? state.ids.get(key) : undefined;
    if (known !== undefined && state.commandable[known]) return known;
    if (Array.isArray(key)) throw new Error("A command names a list of components where one component's symbol goes.");
    if (typeof key !== "symbol") throw new Error(`"${labelOf(key)}" isn't a component: a component's key is a symbol.`);
    if (kindOf(key) === "resource") throw new Error(`"${labelOf(key)}" is a resource, not a component.`);
    const id = idOf(state, key);
    if (state.derived[id]) throw new Error(`"${labelOf(key)}" is derived, so only rules add and remove it.`);
    state.commandable[id] = true;
    return id;
};

/** The archetype for sorted component ids, created if needed. Creation allocates, so it happens only at sync points. */
export const archetypeOf = (state: State, components: readonly number[]): Archetype => {
    const key = components.join(",");
    const existing = state.archetypeByKey.get(key);
    if (existing !== undefined) return existing;
    const archetype = createArchetype(state.memory, state.archetypes.length, components, state.layouts, components.some(id => state.resources.has(id)), state.ticked, state.bumped, state.replaced, state.remote);
    state.archetypes.push(archetype);
    state.archetypeByKey.set(key, archetype);
    return archetype;
};

/** Starts keeping ticks for components, in every archetype. Allocates, so it runs only between runs. */
export const startTicking = (state: State, components: readonly number[]): void => {
    for (const id of components) {
        if (state.ticked.has(id)) continue;
        state.ticked.add(id);
        for (const archetype of state.archetypes) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) startTicks(state.memory, archetype, storage, state.tick);
        }
    }
};

/** The archetype with `id` added, through a cached edge. Creating one allocates, so this runs only at sync points. */
export const withComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] !== undefined) return archetype;
    let next = archetype.adding[id];
    if (next === undefined) {
        next = archetypeOf(state, [...archetype.components, id].sort((a, b) => a - b));
        archetype.adding[id] = next;
    }
    return next;
};

export const withoutComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] === undefined) return archetype;
    let next = archetype.removing[id];
    if (next === undefined) {
        next = archetypeOf(state, archetype.components.filter(component => component !== id));
        archetype.removing[id] = next;
    }
    return next;
};

/** The storages two archetypes share, as source and target pairs, cached per pair. */
export const movesOf = (from: Archetype, to: Archetype): readonly Storage[] => {
    let moves = from.moves[to.id];
    if (moves === undefined) {
        moves = to.storages.flatMap(storage => {
            const source = from.storageById[storage.component];
            return source === undefined ? [] : [source, storage];
        });
        from.moves[to.id] = moves;
    }
    return moves;
};

/** Own symbol keys whose value isn't `undefined`: string keys are never a component's. */
export const entriesOf = (values: object): [Key, unknown][] => {
    const entries: [Key, unknown][] = [];
    for (const key of Object.getOwnPropertySymbols(values)) {
        const value: unknown = Reflect.get(values, key);
        if (value !== undefined) entries.push([key, value]);
    }
    return entries;
};
