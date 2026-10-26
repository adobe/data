// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createHolds, type Holds } from './stop-lists.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { declarationOf, firstKeyOf, kindOf, labelOf, whyUnregistered } from '../../interface/registry/index.js';
import type { Arrivals } from './arrivals.js';
import { createArchetype, noShared, startTicks, type Archetype, type Storage } from './archetype.js';
import { createSharedValues, holdShared, internShared, type SharedValues } from './shared.js';
import { noteEdge, reuseArchetype } from './reclaim.js';
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
import { layoutOf, objectLayout, type Layout } from '../../interface/registry/layout.js';
import { numberConstants } from '../../interface/registry/schemas.js';
import { createMemory, type Memory } from './memory.js';
import { createStrings, type StringStore } from './strings.js';
import { createLayoutDirectory, type LayoutDirectory } from './layout-directory.js';
import { createJournal, type Journal } from './journal.js';
import type { Row } from './rows.js';
import type { MoveLog } from './move-log.js';
import type { TaskChannel } from './remote-systems.js';
import type { Tail } from './tails.js';
import { createObserverState, type ObserverState } from './joined-observer.js';
import { claimComponent } from './remote.js';
import type { IndexDefinition } from '../../interface/registry/index.js';
import type { WorldIndex } from './indexes.js';
import type { Failure } from './failures.js';

export type Key = string | symbol;

/** Everything a world stores. Components and resources share ids; resources live on `resourceEntity`. */
/** What a run ran, gathered as its tiers run: how many systems, whether any ran on `main`, GPU work, joined threads by their logs. */
export type Ran = { systems: number; main: boolean; gpu: boolean; readonly joined: Set<MoveLog> };

type RanRunner = { readonly placement: string; readonly remote: { readonly channel: { readonly log: MoveLog } } | null };

/** What a tier's runners run, worked out once per list of runners and `main`'s claim: joined threads' logs, and flags. */
type TierRan = { readonly main: MoveLog | undefined; readonly here: boolean; readonly onMain: boolean; readonly gpu: boolean; readonly logs: readonly MoveLog[] };
const tiersRan = new WeakMap<readonly RanRunner[], TierRan>();

const tierRanOf = (runners: readonly RanRunner[], main: MoveLog | undefined): TierRan => {
    const known = tiersRan.get(runners);
    if (known !== undefined && known.main === main) return known;
    let here = false;
    let onMain = false;
    let gpu = false;
    const logs: MoveLog[] = [];
    for (let i = 0; i < runners.length; i++) {
        const { remote, placement } = runners[i];
        if (remote !== null) {
            if (!logs.includes(remote.channel.log)) logs.push(remote.channel.log);
            if (remote.channel.log === main) onMain = true;
        }
        else here = true;
        if (placement !== "cpu") gpu = true;
    }
    const tier = { main, here, onMain: onMain || (here && main === undefined), gpu, logs };
    tiersRan.set(runners, tier);
    return tier;
};

/** Counts a tier's runners into `ran`: one on a joined thread by its log, one here on `main` unless a joined thread claims it. */
export const countRan = (state: State, runners: readonly RanRunner[]): void => {
    const { ran } = state;
    ran.systems += runners.length;
    const tier = tierRanOf(runners, state.claims.get("main"));
    if (tier.onMain) ran.main = true;
    if (tier.gpu) ran.gpu = true;
    for (let k = 0; k < tier.logs.length; k++) ran.joined.add(tier.logs[k]);
};

/** Starts gathering what a run ran. */
export const startRan = (ran: Ran): void => {
    ran.systems = 0;
    ran.main = false;
    ran.gpu = false;
    if (ran.joined.size !== 0) ran.joined.clear();
};

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
    /**
     * By component: how its values are stored here, strings as objects where there's no shared memory. A shared
     * component's is a constant of its start; each archetype's storage of it holds its own value.
     */
    readonly layouts: Layout[];
    /** By component id: a shared component's values, interned; undefined for every other, which pays nothing for them. */
    readonly shared: (SharedValues | undefined)[];
    /** Each shared component's values, as `shared` holds them, in a list of their own. */
    readonly sharedList: SharedValues[];
    /** Whether the world has met a shared component, so archetypes are found by values too. */
    sharing: boolean;
    /** Whether a system with `where` and change filters registered, so sync points log rows' moves (`arrivals.ts`). */
    arrivals: boolean;
    /** The ring of rows' moves between archetypes, from the first logged; null before. */
    arrivalRing: Arrivals | null;
    /** By component set, archetypes of shared values reclaimed, waiting to be reused for others (`reclaim.ts`). */
    readonly pools: Map<string, Archetype[]>;
    /** Archetypes of shared values found empty, which may be reclaimed. */
    readonly emptied: Archetype[];
    /**
     * Archetypes reclaimed or reused, in order, which systems' match lists follow from their own position: the log
     * holds those from `base` on, trimmed as it grows.
     */
    readonly membership: { readonly log: Archetype[]; base: number };
    /** How many archetypes were reclaimed or reused, the membership log's end: one number a system's run compares. */
    reshapes: number;
    /** Sync points applied, which reclaiming counts. */
    syncs: number;
    /** The records strings' columns name, in shared memory; null without it, where strings are held as objects. */
    readonly strings: StringStore | null;
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
    /** The entities sync points spawned, despawned, moved or wrote references of, for `up` systems and indexes. */
    readonly journal: Journal;
    /** Command buffers for the next sync point, in merge order. */
    readonly queued: Queued[];
    /** Buffers that workers' command ring segments drain into, the first `drained` in use until the sync point's end. */
    readonly drains: CommandBuffer[];
    drained: number;
    resourceEntity: number;
    /**
     * Components some registered system filters on with `changed`, or a finalizer's index follows; only their kernel
     * stamps are kept. By component id, how many do: each system while registered, each finalizer index's watch for the
     * world's life (`observe`).
     */
    readonly observed: Set<number>;
    readonly observedCounts: number[];
    /** Workers' kernel indexes, by kernel module url, so they're bounded by code. */
    readonly kernelIndexes: Map<string, number>;
    /**
     * Components some registered system filters on with `added` or `changed`, a finalizer's index follows, or a GPU
     * system holds copies of; only they keep ticks.
     */
    readonly ticked: Set<number>;
    /**
     * Components some system registered since the world began holds GPU copies of. Kernels keep their chunk stamps,
     * so a GPU copy uploads only the chunks CPU writes changed.
     */
    readonly resident: Set<number>;
    /** Main-thread spawns since the last sync point, by component set. */
    readonly batches: SpawnBatch[];
    readonly batchByKey: Map<string, SpawnBatch>;
    /**
     * Lists of components commands named, by their sorted ids; lists the build gave indexes, and those made at runtime
     * that keep one while their keys stay the same, by their index; and the last eight made at runtime, by their keys,
     * which find copies of them before they keep their own (`lists.ts`).
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
    /**
     * Rows of an archetype a kernel runs here at which it wants the pool, while none is started: infinite with a pool,
     * or without workers to start. A kernel reaching it sets `poolWanted`, and the next run starts the pool.
     */
    poolThreshold: number;
    poolWanted: boolean;
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
    /** The system without components whose body's value the run in progress resolves to; null for none, as in a tick. */
    wanted: Leaf | null;
    /** While a finalizer's failure is reported out of band, the finalizers each sync point ran, which then recover. */
    finalized: Set<object> | null;
    /** What the run in progress ran: systems, whether any ran on `main`, GPU work, joined threads' logs. */
    readonly ran: Ran;
    /** Whether a joined thread reads the layout directory's counts: one holds claims, or has observer systems placed. */
    counting: boolean;
    /** Observer systems on joined threads (`joined-observer.ts`). */
    readonly observer: ObserverState;
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
     * Failures of finalizers the next sync point gives its run: those on claimed threads that can't run there, which don't
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
    /** Unique indexes' conflicts refreshes found, failures of the run in progress. */
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
        shared: [],
        sharedList: [],
        sharing: false,
        arrivals: false,
        arrivalRing: null,
        pools: new Map(),
        emptied: [],
        membership: { log: [], base: 0 },
        reshapes: 0,
        syncs: 0,
        strings: memory.shared ? createStrings(memory) : null,
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
        resident: new Set(),
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
        poolThreshold: Infinity,
        poolWanted: false,
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
        wanted: null,
        finalized: null,
        ran: { systems: 0, main: false, gpu: false, joined: new Set() },
        counting: false,
        observer: createObserverState(),
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

/** Counts one more system or index watching a component's changes, so kernels keep its stamps. */
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
    if (declaration === undefined) throw new Error(`"${labelOf(key)}" has no registered schema: ${whyUnregistered(key)}.`);
    const { structure } = state;
    // A host gets its id first, so stratifying with the new edge can name it; a cycle throws before anything is
    // recorded.
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
    const shared = declaration.shared === true;
    const declared: Layout = shared ? { kind: "constant", value: defaultOf(key), shared: true } : layoutOf(declaration.type);
    // Only other threads need strings in shared memory, and there are none without it.
    const layout: Layout = declared.kind === "string" && state.strings === null ? objectLayout : declared;
    state.layouts.push(layout);
    const values = shared ? createSharedValues(declaration.type) : undefined;
    state.shared.push(values);
    if (values !== undefined) {
        state.sharing = true;
        state.sharedList.push(values);
    }
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
 * What a resource or derived component starts at: a new empty `Map` or `Set` when it starts fresh, so each world has
 * its own; its declaration's default, which the build gives; or `null` when its type allows leaving it out.
 */
export const defaultOf = (key: Key): unknown => {
    const declaration = declarationOf(key);
    if (declaration === undefined) return null;
    if (declaration.fresh === "Map") return new Map();
    if (declaration.fresh === "Set") return new Set();
    if ("default" in declaration) return declaration.default;
    const { type } = declaration;
    if (type === undefined) return null;
    // A union of number constants starts at its first, so its value is always one of them.
    return numberConstants(type)?.[0] ?? null;
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

/**
 * An archetype's key: its sorted component ids, each shared one with the number of its value, so archetypes of one
 * component set but other values are others.
 */
const keyOf = (state: State, components: readonly number[], values: readonly (number | undefined)[]): string => {
    if (!state.sharing) return components.join(",");
    let key = "";
    for (let k = 0; k < components.length; k++) {
        const id = components[k];
        if (k > 0) key += ",";
        key += state.shared[id] === undefined ? `${id}` : `${id}=${values[id] ?? missingValue(state, id)}`;
    }
    return key;
};

const missingValue = (state: State, id: number): never => {
    throw new Error(`An archetype of "${labelOf(state.keys[id])}", a shared component, needs its value.`);
};

/**
 * The archetype for sorted component ids, with `values` by component id for the shared ones, the numbers of theirs,
 * created if needed: values of components it doesn't hold are ignored. Creation allocates, so it happens only at sync
 * points.
 */
export const archetypeOf = (state: State, components: readonly number[], values: readonly (number | undefined)[] = noShared): Archetype => {
    const key = keyOf(state, components, values);
    const existing = state.archetypeByKey.get(key);
    if (existing !== undefined) return existing;
    return makeArchetype(state, key, components, values);
};

/** `archetypeOf` an archetype not found by its key: one of its component set reclaimed and reused, or a new one. */
const makeArchetype = (state: State, key: string, components: readonly number[], values: readonly (number | undefined)[]): Archetype => {
    const held: (number | undefined)[] = [];
    const layouts: (Layout | undefined)[] = [];
    const texts: (string | undefined)[] = [];
    for (const id of components) {
        const interned = state.shared[id];
        const number = values[id];
        if (interned === undefined || number === undefined) continue;
        held[id] = number;
        layouts[id] = { kind: "constant", value: interned.values[number], shared: true };
        texts[id] = interned.texts[number];
    }
    const shared = held.length === 0 ? noShared : held;
    const reused = shared === noShared ? null : reuseArchetype(state, key, components, held, layouts, texts);
    if (reused !== null) {
        state.archetypeByKey.set(key, reused);
        return reused;
    }
    const archetype = createArchetype(state.memory, state.strings, state.archetypes.length, components, state.layouts, components.some(id => state.resources.has(id)), state.ticked, state.bumped, state.replaced, state.remote, shared, layouts, texts, key);
    for (const id of components) {
        const number = held[id];
        const interned = state.shared[id];
        if (number !== undefined && interned !== undefined) holdShared(interned, number);
    }
    state.archetypes.push(archetype);
    state.archetypeByKey.set(key, archetype);
    return archetype;
};

/**
 * A value a command gives shared component `id` as stored, interned if new, so the sync point finds its number by it;
 * throws, failing the issuing system, for one not of its type.
 */
export const storedShared = (state: State, id: number, value: unknown): unknown => {
    const values = state.shared[id];
    const number = values === undefined ? -1 : internShared(values, value);
    if (values === undefined || number < 0) throw new Error(`"${labelOf(state.keys[id])}", a shared component, isn't given one of its type's values: ${labelOf(value)}.`);
    return values.values[number];
};

/**
 * The number of a value a command gives shared component `id`: one `storedShared` interned as the command was issued.
 */
export const sharedNumberOf = (state: State, id: number, value: unknown): number => {
    const values = state.shared[id];
    const number = values === undefined ? -1 : internShared(values, value);
    if (number < 0) throw new Error(`A command gives "${labelOf(state.keys[id])}", a shared component, ${labelOf(value)}, which isn't one of its type's values.`);
    return number;
};

/**
 * The archetype with value number `number` of shared component `id`, in place of its own or added, through a cached
 * edge. Creating one allocates, so this runs only at sync points.
 */
export const withShared = (state: State, archetype: Archetype, id: number, number: number): Archetype => {
    if (archetype.shared[id] === number) return archetype;
    const edges = archetype.sharing[id] ??= [];
    let next = edges[number];
    if (next === undefined) {
        const values = [...archetype.shared];
        values[id] = number;
        const components = archetype.storageById[id] === undefined ? [...archetype.components, id].sort((a, b) => a - b) : archetype.components;
        next = archetypeOf(state, components, values);
        edges[number] = next;
        noteEdge(edges, number, undefined, archetype, next);
    }
    return next;
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

/**
 * Marks components as held on the GPU, once they keep ticks. Returns whether any is new, so kernels that muted its
 * chunk stamps load again.
 */
export const reside = (state: State, components: readonly number[]): boolean => {
    let added = false;
    for (const id of components) {
        if (state.resident.has(id)) continue;
        state.resident.add(id);
        added = true;
    }
    return added;
};

/** The archetype with `id` added, through a cached edge. Creating one allocates, so this runs only at sync points. */
export const withComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] !== undefined) return archetype;
    let next = archetype.adding[id];
    if (next === undefined) {
        next = archetypeOf(state, [...archetype.components, id].sort((a, b) => a - b), archetype.shared);
        archetype.adding[id] = next;
        noteEdge(archetype.adding, id, undefined, archetype, next);
    }
    return next;
};

export const withoutComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] === undefined) return archetype;
    let next = archetype.removing[id];
    if (next === undefined) {
        next = archetypeOf(state, archetype.components.filter(component => component !== id), archetype.shared);
        archetype.removing[id] = next;
        noteEdge(archetype.removing, id, undefined, archetype, next);
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
