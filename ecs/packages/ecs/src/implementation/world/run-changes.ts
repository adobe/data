// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../../interface/entity/entity.js';
import type { Essential, ReadonlyType } from '../../interface/component/value.js';
import type { ChangeSet } from '../../interface/system/sync-system-body.js';
import type { Resource } from '../../interface/resource/resource.js';
import { isLeaf, newestKeyOf, scheduleOf, type Definition, type Leaf } from '../../interface/registry/index.js';
import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { asEntity, indexOf, locate } from './entities.js';
import { sameValue } from './resource-changes.js';
import { findResource, initialOf } from './resources.js';
import { metIdOf, type Key, type State } from './state.js';
import type { Queued } from './synchronize.js';

/**
 * What a run asked for its changes holds while it runs: by entity its sync points planned, the watched components it
 * had before the run, none for one born in it, with their values then, and those its adds gave a value; and the
 * resources its systems write or reduce into, with their values before it.
 */
export type Recording = {
    readonly before: Map<number, { readonly ids: readonly number[] | null; readonly values: ReadonlyMap<number, unknown> }>;
    readonly given: Map<number, Set<number>>;
    readonly resources: ReadonlyMap<Key, unknown>;
};

/** Every component but derived ones and the objects a joined thread fills, as a changes system watches by default. */
const watched = (state: State, id: number): boolean => !state.derived[id] && !state.resources.has(id) && state.remote[id] === undefined;

const noValues: ReadonlyMap<number, unknown> = new Map();

/** The values of components `ids` of an archetype's row. */
const valuesAt = (archetype: Archetype, ids: readonly number[], row: number): ReadonlyMap<number, unknown> => {
    const values = new Map<number, unknown>();
    for (const id of ids) {
        const storage = archetype.storageById[id];
        if (storage !== undefined) values.set(id, readCell(storage, row));
    }
    return values;
};

/** Starts recording a run whose systems write or reduce into `resources`, from their values now. */
export const startRecording = (state: State, resources: Iterable<Key>): Recording => {
    const values = new Map<Key, unknown>();
    for (const key of resources) {
        const cell = findResource(state, key);
        values.set(key, cell === undefined ? initialOf(state, key) : readCell(cell.storage, cell.row));
    }
    return { before: new Map(), given: new Map(), resources: values };
};

/**
 * At a sync point of the run, before it applies: each entity its plan names that no earlier one did, with what it has
 * now, and the components its adds give a value. `born` holds the rows committed from batches here, by archetype.
 */
export const recordPlan = (state: State, recording: Recording, queued: readonly Queued[], born: ReadonlyMap<number, number>): void => {
    const { plan, archetypes, entities } = state;
    const note = (entity: number, from: Archetype | null): void => {
        if (recording.before.has(entity) || from?.resource === true) return;
        if (from === null) {
            recording.before.set(entity, { ids: null, values: noValues });
            return;
        }
        const row = entities.row[indexOf(entity)];
        const ids = from.components.filter(id => watched(state, id));
        recording.before.set(entity, { ids, values: valuesAt(from, ids, row) });
    };
    const give = (entity: number, buffer: number, start: number, end: number): void => {
        const { ids } = queued[buffer].buffer;
        for (let k = start; k < end; k++) {
            if (!watched(state, ids[k])) continue;
            let given = recording.given.get(entity);
            if (given === undefined) recording.given.set(entity, given = new Set());
            given.add(ids[k]);
        }
    };
    for (let entry = 0; entry < plan.count; entry++) {
        const entity = plan.entity[entry];
        const fromId = plan.from[entry];
        const first = fromId < 0 ? undefined : born.get(fromId);
        note(entity, fromId < 0 || (first !== undefined && entities.row[indexOf(entity)] >= first) ? null : archetypes[fromId]);
        if (plan.start[entry] < 0) continue;
        give(entity, plan.buffer[entry], plan.start[entry], plan.end[entry]);
        const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
        if (more !== undefined) for (let r = 0; r < more.length; r += 3) give(entity, more[r], more[r + 1], more[r + 2]);
    }
    // Rows committed from batches no command touched have no entry.
    for (const [id, first] of born) {
        const archetype = archetypes[id];
        for (let row = first; row < archetype.count; row++) note(archetype.entities[row], null);
    }
};

/** A watched component's newest key: watched components are registered and not derived, so they're essential. */
const keyOf = (state: State, id: number): Essential => newestKeyOf(state.keys[id]) as Essential;

/** A group of a change set, as it's built. */
type Grouped = { from: Essential[] | null; to: Essential[] | null; added: Essential[]; removed: Essential[]; replaced: Essential[]; entities: Entity[] };

/**
 * The run's change set once its last sync point applied: each entity grouped by the watched components it had before
 * the run and has after, those it gained and lost, and those adds gave a value it had before and after, with their
 * values then and now; and each resource its systems write or reduce into whose value changed.
 */
export const changesOf = (state: State, recording: Recording): ChangeSet<Essential, Resource.Key> => {
    const { archetypes, entities } = state;
    const groups = new Map<string, Grouped>();
    const after = new Map<number, ReadonlyMap<number, unknown>>();
    for (const [entity, { ids: before }] of recording.before) {
        const index = locate(entities, entity);
        const to = index < 0 ? null : archetypes[entities.archetype[index]];
        const ids = to === null ? null : to.components.filter(id => watched(state, id));
        if (before === null && ids === null) continue;
        const added = (ids ?? []).filter(id => !(before ?? []).includes(id));
        const removed = (before ?? []).filter(id => !(ids ?? []).includes(id));
        const replaced = [...recording.given.get(entity) ?? []].filter(id => before?.includes(id) === true && ids?.includes(id) === true).sort((a, b) => a - b);
        if (added.length === 0 && removed.length === 0 && replaced.length === 0) continue;
        if (to !== null && ids !== null) {
            after.set(entity, valuesAt(to, ids, entities.row[index]));
        }
        const name = `${before?.join(",") ?? "-"}|${ids?.join(",") ?? "-"}|${replaced.join(",")}`;
        let group = groups.get(name);
        const keys = (list: readonly number[] | null): Essential[] | null => list === null ? null : list.map(id => keyOf(state, id));
        if (group === undefined) {
            groups.set(name, group = { from: keys(before), to: keys(ids), added: added.map(id => keyOf(state, id)), removed: removed.map(id => keyOf(state, id)), replaced: replaced.map(id => keyOf(state, id)), entities: [] });
        }
        group.entities.push(asEntity(entity));
    }
    const resources: { key: Resource.Key; previous: unknown; next: unknown }[] = [];
    for (const [key, previous] of recording.resources) {
        const cell = findResource(state, key);
        const next = cell === undefined ? previous : readCell(cell.storage, cell.row);
        // A key the run's systems name is a resource's.
        if (!sameValue(previous, next)) resources.push({ key: newestKeyOf(key) as Resource.Key, previous, next });
    }
    const valueOf = (values: ReadonlyMap<number, unknown> | undefined, key: Essential): unknown => {
        const id = metIdOf(state, key);
        return id !== undefined && values?.has(id) === true ? values.get(id) : null;
    };
    return {
        groups: [...groups.values()],
        // Values read from storage match each key's registered schema, so they have its type.
        resources: resources as ChangeSet<Essential, Resource.Key>["resources"],
        previous: <K extends Essential>(entity: Entity, key: K) => valueOf(recording.before.get(entity)?.values, key) as ReadonlyType<K> | null,
        next: <K extends Essential>(entity: Entity, key: K) => valueOf(after.get(entity), key) as ReadonlyType<K> | null,
    };
};

/** A system's leaves that run in tiers, or the system itself. */
const leavesOf = (definition: Definition): readonly Leaf[] => isLeaf(definition) ? [definition] : scheduleOf(definition).tiers.flat();

/** The resources a system's leaves write or reduce into. */
export const resourcesWrittenBy = (definition: Definition): ReadonlySet<Key> =>
    new Set(leavesOf(definition).flatMap(leaf => [...leaf.declaration.resources?.write ?? [], ...leaf.declaration.resources?.reduce ?? []]));

/** Whether a system or composite takes input, so a run's options follow it. */
export const takesInput = (definition: Definition): boolean =>
    isLeaf(definition) ? definition.input !== undefined : [...scheduleOf(definition).tiers.flat(), ...scheduleOf(definition).observer].some(leaf => leaf.input !== undefined);

/** Whether a run's options ask for its changes. */
export const asksForChanges = (options: unknown): boolean => typeof options === "object" && options !== null && Reflect.get(options, "changes") === true;
