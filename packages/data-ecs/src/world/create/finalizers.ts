import type { Component } from '../../component/component.js';
import type { Entity } from '../../entity/entity.js';
import type { Finalizer } from '../../finalizer/finalizer.js';
import type { ChangeSet } from '../../finalizer/body.js';
import type { Commands } from '../../system/commands.js';
import type { Archetype } from './archetype.js';
import { createBuffer, type CommandBuffer } from './buffer.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { asEntity, indexOf, locate } from './entities.js';
import { createContext, rowBinder, type Context } from './rows.js';
import { idOf, type Key, type State } from './state.js';
import type { Queued } from './synchronize.js';

/** A registered finalizer, resolved for a world: what it matches or watches, its context, and the buffer its commands go to. */
export type FinalizerRunner = {
    readonly name: string;
    readonly finalizer: Finalizer;
    readonly required: readonly number[];
    readonly excluded: readonly number[];
    /** For a changes finalizer: whether it watches a component, by id. */
    readonly watches: (id: number) => boolean;
    /** By archetype id: 1 if it matches, 2 if not, 0 until known. */
    readonly matches: number[];
    readonly context: Context;
    /** A new buffer each sync point it issues commands in, since the last one is queued for the next. */
    readonly target: { buffer: CommandBuffer };
    readonly commands: Commands;
    readonly reads: readonly Key[];
};

export const isFinalizer = (value: { readonly kind: string }): value is Finalizer => value.kind === "finalizer" || value.kind === "changes";

export const createFinalizerRunner = (state: State, finalizer: Finalizer): FinalizerRunner => {
    const { declaration } = finalizer;
    const query = finalizer.kind === "finalizer" ? finalizer.declaration.components : undefined;
    const reads = query?.read ?? [];
    // By default every component that isn't derived, including ones a world first meets later; never resources.
    let watches = (id: number): boolean => !state.derived[id] && !state.resources.has(id);
    const watch = finalizer.kind === "changes" ? finalizer.declaration.watch : undefined;
    if (watch !== undefined) {
        const watched = new Set(watch.map(key => {
            const id = idOf(state, key);
            if (state.derived[id]) throw new Error(`Finalizer "${declaration.name}" watches "${String(key)}", which is derived; it sees only components user code adds and removes.`);
            return id;
        }));
        watches = id => watched.has(id);
    }
    const target = { buffer: createBuffer() };
    const commands = createCommands(state, target);
    return {
        name: declaration.name,
        finalizer,
        required: [...new Set([...reads, ...query?.has ?? []])].map(key => idOf(state, key)),
        excluded: (query?.not ?? []).map(key => idOf(state, key)),
        watches,
        matches: [],
        context: createContext(state, declaration, { commands }),
        target,
        commands,
        reads,
    };
};

const matches = (runner: FinalizerRunner, archetype: Archetype): boolean => {
    let known = runner.matches[archetype.id] ?? 0;
    if (known === 0) {
        const { storageById } = archetype;
        known = !archetype.resource && runner.required.every(id => storageById[id] !== undefined) && runner.excluded.every(id => storageById[id] === undefined) ? 1 : 2;
        runner.matches[archetype.id] = known;
    }
    return known === 1;
};

/** Whether the entity at `entry` was alive before this sync point: neither spawned by a command nor committed from a batch here. */
const fromOf = (state: State, entry: number): Archetype | null => {
    const { plan } = state;
    const from = plan.from[entry];
    if (from < 0) return null;
    const first = state.born?.get(from);
    return first !== undefined && state.entities.row[indexOf(plan.entity[entry])] >= first ? null : state.archetypes[from];
};

type Untyped = { body(row: object, context: object): void };

/** Calls `body`, keeping the first error for after the sync point applies. */
const guarded = (errors: unknown[], body: () => void): void => {
    try { body(); }
    catch (error) { errors.push(error); }
};

/** Each entity that stops matching: it matched before, and is despawned, no longer matches, or had a required component replaced. */
const finalizeStops = (state: State, runner: FinalizerRunner, leaf: Finalizer.Leaf, errors: unknown[]): void => {
    // Rows and contexts are built to each finalizer's declaration, so its body accepts them.
    const finalizer: Untyped = leaf;
    const { plan, archetypes, entities } = state;
    const byArchetype = new Map<Archetype, number[]>();
    for (let entry = 0; entry < plan.count; entry++) {
        const from = fromOf(state, entry);
        if (from === null || !matches(runner, from)) continue;
        const stops = plan.despawned[entry] === 1 || !matches(runner, archetypes[plan.to[entry]])
            || (plan.fresh.get(entry)?.some(id => runner.required.includes(id)) ?? false);
        if (!stops) continue;
        let entries = byArchetype.get(from);
        if (entries === undefined) byArchetype.set(from, entries = []);
        entries.push(entry);
    }
    const bind = rowBinder(state, runner.reads, []);
    for (const [archetype, stopped] of byArchetype) {
        const row = bind(archetype);
        for (const entry of stopped) {
            row.index = entities.row[indexOf(plan.entity[entry])];
            guarded(errors, () => finalizer.body(row.value, runner.context.value));
        }
    }
};

const missing = Symbol("missing");

/** The last value commands give `id` within an entry's ranges, in issue order, or `missing`. */
export const commandValue = (state: State, queued: readonly Queued[], entry: number, id: number): unknown => {
    const { plan } = state;
    if (plan.start[entry] < 0) return missing;
    const last = (buffer: number, start: number, end: number, found: unknown): unknown => {
        const { ids, values } = queued[buffer].buffer;
        let value = found;
        for (let k = start; k < end; k++) if (ids[k] === id) value = values[k];
        return value;
    };
    let value = last(plan.buffer[entry], plan.start[entry], plan.end[entry], missing);
    const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
    if (more !== undefined) for (let r = 0; r < more.length; r += 3) value = last(more[r], more[r + 1], more[r + 2], value);
    return value;
};

export const isMissing = (value: unknown): boolean => value === missing;

/** A watched component's name: watched components are registered and not derived, so they're essential. */
const essential = (state: State, id: number): Component.Essential => state.keys[id] as Component.Essential;

/** The sync point's structural changes to a changes finalizer's components, grouped by how they changed. */
const changesOf = (state: State, runner: FinalizerRunner, queued: readonly Queued[]): ChangeSet<Component.Essential> => {
    const { plan, archetypes, entities } = state;
    const { watches } = runner;
    const names = (archetype: Archetype | null): Component.Essential[] | null =>
        archetype === null ? null : archetype.components.filter(watches).map(id => essential(state, id));
    const groups = new Map<string, { from: Component.Essential[] | null; to: Component.Essential[] | null; added: Component.Essential[]; removed: Component.Essential[]; replaced: Component.Essential[]; entities: Entity[] }>();
    /** By `from` and `to` archetype ids: the watched components on each side, and those added and removed. */
    const pairs = new Map<number, { readonly before: Component.Essential[] | null; readonly after: Component.Essential[] | null; readonly added: Component.Essential[]; readonly removed: Component.Essential[] }>();
    const pairOf = (from: Archetype | null, to: Archetype | null) => {
        const key = ((from?.id ?? -1) + 1) * 0x200000 + (to?.id ?? -1) + 1;
        let pair = pairs.get(key);
        if (pair === undefined) {
            const before = names(from);
            const after = names(to);
            pair = { before, after, added: (after ?? []).filter(name => !(before ?? []).includes(name)), removed: (before ?? []).filter(name => !(after ?? []).includes(name)) };
            pairs.set(key, pair);
        }
        return pair;
    };
    const add = (entity: number, from: Archetype | null, to: Archetype | null, fresh: readonly number[]): void => {
        // The resource entity's components are resources, not changes.
        if (from?.resource === true || to?.resource === true) return;
        const replaced = fresh.length === 0 ? fresh : fresh.filter(id => watches(id) && from?.storageById[id] !== undefined && to?.storageById[id] !== undefined);
        const { before, after, added, removed } = pairOf(from, to);
        if (replaced.length === 0 && added.length === 0 && removed.length === 0) return;
        const key = `${from?.id ?? -1}:${to?.id ?? -1}:${replaced.join(",")}`;
        let group = groups.get(key);
        if (group === undefined) groups.set(key, group = { from: before, to: after, added, removed, replaced: replaced.map(id => essential(state, id)), entities: [] });
        group.entities.push(asEntity(entity));
    };
    for (let entry = 0; entry < plan.count; entry++) {
        const from = fromOf(state, entry);
        const despawned = plan.despawned[entry] === 1;
        // Spawned and despawned within the sync point: never there before or after.
        if (from === null && despawned) continue;
        add(plan.entity[entry], from, despawned ? null : archetypes[plan.to[entry]], plan.fresh.get(entry) ?? []);
    }
    // Batch spawns no command touched, which have no entry.
    for (const [id, first] of state.born ?? []) {
        const archetype = archetypes[id];
        for (let row = first; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            if ((plan.slots[indexOf(entity)] ?? -1) < 0) add(entity, null, archetype, []);
        }
    }
    const live = (entity: Entity, id: number): unknown => {
        const index = locate(entities, entity);
        if (index < 0) return null;
        const storage = archetypes[entities.archetype[index]].storageById[id];
        return storage === undefined ? null : readCell(storage, entities.row[index]);
    };
    const bornHere = (entity: Entity): boolean => {
        const index = locate(entities, entity);
        if (index < 0) return true;
        const first = state.born?.get(entities.archetype[index]);
        return first !== undefined && entities.row[index] >= first;
    };
    const next = (entity: Entity, id: number): unknown => {
        const entry = plan.slots[indexOf(entity)] ?? -1;
        if (entry < 0 || plan.entity[entry] !== entity) return live(entity, id);
        if (plan.despawned[entry] === 1 || archetypes[plan.to[entry]].storageById[id] === undefined) return null;
        const value = commandValue(state, queued, entry, id);
        return isMissing(value) ? live(entity, id) : value;
    };
    return {
        groups: [...groups.values()],
        // Stored and commanded values match each component's registered schema, so they have its type.
        previous: <K extends Component.Essential>(entity: Entity, key: K) => (bornHere(entity) ? null : live(entity, idOf(state, key))) as Component.ReadonlyValue<K> | null,
        next: <K extends Component.Essential>(entity: Entity, key: K) => next(entity, idOf(state, key)) as Component.ReadonlyValue<K> | null,
    };
};

/**
 * Runs every finalizer against the planned sync point, before it applies, in their order. Their commands queue for the
 * next sync point. Returns the errors they threw, for after the sync point applies.
 */
export const runFinalizers = (state: State, queued: readonly Queued[], born: Map<number, number>): unknown[] => {
    const errors: unknown[] = [];
    state.born = born;
    try {
        for (const runner of state.finalizers) {
            runner.context.bind();
            const { finalizer } = runner;
            if (finalizer.kind === "finalizer") finalizeStops(state, runner, finalizer, errors);
            else {
                // The context is built to the finalizer's declaration, so its body accepts it.
                const changes: { body(changes: ChangeSet<Component.Essential>, context: object): void } = finalizer;
                guarded(errors, () => changes.body(changesOf(state, runner, queued), runner.context.value));
            }
            if (runner.target.buffer.count > 0) {
                state.queued.push({ buffer: runner.target.buffer, guarded: true });
                runner.target.buffer = createBuffer();
            }
        }
    }
    finally {
        state.born = null;
    }
    return errors;
};

/** At disposal: every per-query finalizer runs for every live entity it matches, so the handles they release are. */
export const finalizeAll = (state: State): unknown[] => {
    const errors: unknown[] = [];
    for (const runner of state.finalizers) {
        const { finalizer: leaf } = runner;
        if (leaf.kind !== "finalizer") continue;
        const finalizer: Untyped = leaf;
        runner.context.bind();
        const bind = rowBinder(state, runner.reads, []);
        for (const archetype of state.archetypes) {
            if (archetype.count === 0 || !matches(runner, archetype)) continue;
            const row = bind(archetype);
            for (let index = 0; index < archetype.count; index++) {
                row.index = index;
                guarded(errors, () => finalizer.body(row.value, runner.context.value));
            }
        }
    }
    return errors;
};


/**
 * Finalizers in run order: `before` and `after` first, then registration order. Throws for a cycle, and for two that
 * both write a resource, or where one reads what the other writes, with no ordering between them.
 */
export const orderFinalizers = (runners: readonly FinalizerRunner[]): FinalizerRunner[] => {
    const indexByName = new Map(runners.map((runner, index) => [runner.name, index]));
    const successors = runners.map(() => new Set<number>());
    runners.forEach((runner, index) => {
        const { before, after } = runner.finalizer.declaration;
        for (const name of before ?? []) { const other = indexByName.get(name); if (other !== undefined) successors[index].add(other); }
        for (const name of after ?? []) { const other = indexByName.get(name); if (other !== undefined) successors[other].add(index); }
    });
    const incoming = runners.map(() => 0);
    for (const next of successors) for (const other of next) incoming[other]++;
    const order: number[] = [];
    const ready = runners.flatMap((_, index) => incoming[index] === 0 ? [index] : []);
    while (ready.length > 0) {
        ready.sort((a, b) => a - b);
        const index = ready.shift() ?? 0;
        order.push(index);
        for (const other of successors[index]) if (--incoming[other] === 0) ready.push(other);
    }
    if (order.length < runners.length) {
        const cycle = runners.filter((_, index) => !order.includes(index)).map(runner => `"${runner.name}"`).join(", ");
        throw new Error(`Finalizers ${cycle} are ordered in a cycle.`);
    }
    const reaches = (from: number, to: number): boolean => {
        const seen = new Set<number>();
        const stack = [from];
        while (stack.length > 0) {
            const next = stack.pop() ?? 0;
            if (next === to) return true;
            if (seen.has(next)) continue;
            seen.add(next);
            stack.push(...successors[next]);
        }
        return false;
    };
    const writes = runners.map(runner => new Set<unknown>(runner.finalizer.declaration.resources?.write ?? []));
    const reads = runners.map(runner => new Set<unknown>(runner.finalizer.declaration.resources?.read ?? []));
    for (let a = 0; a < runners.length; a++) for (let b = a + 1; b < runners.length; b++) {
        const conflict = [...writes[a]].find(key => writes[b].has(key) || reads[b].has(key)) ?? [...writes[b]].find(key => reads[a].has(key));
        if (conflict !== undefined && !reaches(a, b) && !reaches(b, a)) {
            throw new Error(`Finalizers "${runners[a].name}" and "${runners[b].name}" both access "${String(conflict)}", one writing it; order them with before or after.`);
        }
    }
    return order.map(index => runners[index]);
};
