import type { Entity } from '../../entity/entity.js';
import { copyCell, insertRow, swapRemove, type Archetype } from './archetype.js';
import { writeCell } from './cells.js';
import { indexOf, locate, materialize, recycle, release } from './entities.js';
import { archetypeOf, entriesOf, idOf, type Command, type State } from './state.js';

/** One entity's net change over a whole sync point. */
type Pending = {
    readonly entity: Entity;
    /** `null` for an entity spawned in this sync point. */
    readonly from: Archetype | null;
    readonly values: Map<number, unknown>;
    readonly removed: Set<number>;
    /** Components that start in this sync point, so their `added` tick is new: absent before, or removed then added again. */
    readonly fresh: Set<number>;
    despawned: boolean;
};

const pendingFor = (state: State, plan: Map<number, Pending>, entity: Entity): Pending | null => {
    const index = indexOf(entity);
    const pending = plan.get(index);
    if (pending !== undefined) return pending.entity === entity && !pending.despawned ? pending : null;
    if (locate(state.entities, entity) < 0) return null;
    const created: Pending = {
        entity,
        from: state.archetypes[state.entities.archetype[index]],
        values: new Map(),
        removed: new Set(),
        fresh: new Set(),
        despawned: false,
    };
    plan.set(index, created);
    return created;
};

const addValues = (state: State, pending: Pending, values: object): void => {
    for (const [key, value] of entriesOf(values)) {
        const id = idOf(state, key);
        if (pending.from === null || !pending.from.storageOf.has(id) || pending.removed.has(id)) pending.fresh.add(id);
        pending.removed.delete(id);
        pending.values.set(id, value);
    }
};

/** Plan: the net change for each entity, in issue order. Commands against dead entities do nothing. */
const planOf = (state: State, commands: readonly Command[]): Map<number, Pending> => {
    const plan = new Map<number, Pending>();
    for (const command of commands) {
        if (command.kind === "spawn") {
            const pending: Pending = { entity: command.entity, from: null, values: new Map(), removed: new Set(), fresh: new Set(), despawned: false };
            plan.set(indexOf(command.entity), pending);
            addValues(state, pending, command.values);
            continue;
        }
        const pending = pendingFor(state, plan, command.entity);
        if (pending === null) continue;
        if (command.kind === "despawn") {
            pending.despawned = true;
        }
        else if (command.kind === "add") {
            addValues(state, pending, command.values);
        }
        else {
            for (const key of command.components) {
                const id = idOf(state, key);
                pending.values.delete(id);
                pending.fresh.delete(id);
                if (pending.from?.storageOf.has(id) === true) pending.removed.add(id);
            }
        }
    }
    return plan;
};

const componentsOf = (pending: Pending): readonly number[] => {
    const components = new Set(pending.from?.components);
    for (const id of pending.removed) components.delete(id);
    for (const id of pending.values.keys()) components.add(id);
    return [...components].sort((a, b) => a - b);
};

const remove = (state: State, archetype: Archetype, row: number): void => {
    const moved = swapRemove(archetype, row);
    if (moved !== -1) state.entities.row[indexOf(moved)] = row;
};

const applyPending = (state: State, pending: Pending, tick: number): void => {
    const { entities } = state;
    const index = indexOf(pending.entity);
    const { from } = pending;
    if (pending.despawned) {
        if (from !== null) remove(state, from, entities.row[index]);
        release(entities, index);
        return;
    }
    const to = archetypeOf(state, componentsOf(pending));
    const fromRow = from === null ? -1 : entities.row[index];
    const toRow = to === from ? fromRow : insertRow(state.memory, to, pending.entity);
    if (to !== from) {
        for (const storage of to.storages) {
            const source = from?.storageOf.get(storage.component);
            if (source !== undefined && !pending.values.has(storage.component)) copyCell(source, fromRow, storage, toRow);
        }
    }
    for (const [id, value] of pending.values) {
        const storage = to.storageOf.get(id);
        if (storage === undefined) continue;
        writeCell(storage, toRow, value);
        storage.changed[toRow] = tick;
        storage.added[toRow] = pending.fresh.has(id) || from === null ? tick : from.storageOf.get(id)?.added[fromRow] ?? tick;
    }
    if (from !== null && to !== from) remove(state, from, fromRow);
    entities.archetype[index] = to.id;
    entities.row[index] = toRow;
};

/** Applies every pending command as one sync point with a new tick. */
export const synchronize = (state: State): void => {
    if (state.commands.length === 0 && state.entities.created === 0 && state.entities.reused === 0) return;
    materialize(state.memory, state.entities);
    const plan = planOf(state, state.commands);
    state.commands.length = 0;
    const tick = ++state.tick;
    for (const pending of plan.values()) applyPending(state, pending, tick);
    recycle(state.entities);
};
