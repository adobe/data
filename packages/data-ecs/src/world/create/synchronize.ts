import { copyCell, insertRow, swapRemove, type Archetype } from './archetype.js';
import { despawnCommand, endOf, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { writeCell } from './cells.js';
import { indexOf, locate, materialize, recycle, release, reserved } from './entities.js';
import { archetypeOf, movesOf, withComponent, withoutComponent, type State } from './state.js';

/** Buffers queued for the next sync point, in merge order. Commands in guarded buffers can't touch the resource entity. */
export type Queued = { readonly buffer: CommandBuffer; readonly guarded: boolean };

/**
 * The plan: each touched entity's net change over a sync point, as reusable parallel arrays rather than an object per entity.
 * `to` is where it ends up; its values are command ranges, applied in issue order so later values win.
 */
const plan = {
    count: 0,
    entity: new Float64Array(64),
    /** Archetype id, or -1 for an entity spawned in this sync point. */
    from: new Int32Array(64),
    to: new Int32Array(64),
    despawned: new Uint8Array(64),
    /** The first command range: queued buffer, start and end. Most entities have one. */
    buffer: new Int32Array(64),
    start: new Int32Array(64),
    end: new Int32Array(64),
    /** Further ranges, as buffer, start, end triples. */
    more: new Map<number, number[]>(),
    /** Components removed and added again here, so their `added` tick is new although `from` had them. */
    fresh: new Map<number, number[]>(),
};

/** Where each entity index's entry is in the plan, or -1; reset after each sync point. */
let slots = new Int32Array(0);

const grownInt32 = (array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> => {
    const grown = new Int32Array(length);
    grown.set(array);
    return grown;
};

const ensurePlanCapacity = (): void => {
    if (plan.count < plan.entity.length) return;
    const length = plan.entity.length * 2;
    const entity = new Float64Array(length);
    entity.set(plan.entity);
    plan.entity = entity;
    const despawned = new Uint8Array(length);
    despawned.set(plan.despawned);
    plan.despawned = despawned;
    plan.from = grownInt32(plan.from, length);
    plan.to = grownInt32(plan.to, length);
    plan.buffer = grownInt32(plan.buffer, length);
    plan.start = grownInt32(plan.start, length);
    plan.end = grownInt32(plan.end, length);
};

const addEntry = (entity: number, index: number, from: number, to: number): number => {
    ensurePlanCapacity();
    const entry = plan.count++;
    plan.entity[entry] = entity;
    plan.from[entry] = from;
    plan.to[entry] = to;
    plan.despawned[entry] = 0;
    plan.start[entry] = plan.end[entry] = -1;
    slots[index] = entry;
    return entry;
};

const addRange = (entry: number, buffer: number, start: number, end: number): void => {
    if (plan.start[entry] < 0) {
        plan.buffer[entry] = buffer;
        plan.start[entry] = start;
        plan.end[entry] = end;
        return;
    }
    let more = plan.more.get(entry);
    if (more === undefined) plan.more.set(entry, more = []);
    more.push(buffer, start, end);
};

/** Plan: the net change for each entity, in issue order. Commands against dead entities do nothing. */
const planOf = (state: State, queued: readonly Queued[]): void => {
    if (slots.length < state.entities.length) slots = new Int32Array(Math.max(state.entities.length, slots.length * 2)).fill(-1);
    const empty = archetypeOf(state, []).id;
    const { archetypes } = state;
    for (let b = 0; b < queued.length; b++) {
        const { buffer, guarded } = queued[b];
        const { kinds, entities, starts, ids } = buffer;
        for (let command = 0; command < kinds.length; command++) {
            const kind = kinds[command];
            const entity = entities[command];
            if (guarded && entity === state.resourceEntity) continue;
            const index = indexOf(entity);
            let entry: number;
            if (kind === spawnCommand) entry = addEntry(entity, index, -1, empty);
            else {
                entry = slots[index];
                if (entry >= 0) {
                    if (plan.entity[entry] !== entity || plan.despawned[entry] === 1) continue;
                }
                else {
                    if (locate(state.entities, entity) < 0) continue;
                    const from = state.entities.archetype[index];
                    entry = addEntry(entity, index, from, from);
                }
            }
            if (kind === despawnCommand) {
                plan.despawned[entry] = 1;
                continue;
            }
            const start = starts[command];
            const end = endOf(buffer, command);
            let to = archetypes[plan.to[entry]];
            if (kind === removeCommand) {
                for (let k = start; k < end; k++) to = withoutComponent(state, to, ids[k]);
                plan.to[entry] = to.id;
                continue;
            }
            const from = plan.from[entry] < 0 ? null : archetypes[plan.from[entry]];
            for (let k = start; k < end; k++) {
                const id = ids[k];
                // Removed earlier in this sync point and added again: a new start, so a new `added` tick.
                if (from !== null && to.storageById[id] === undefined && from.storageById[id] !== undefined) {
                    let fresh = plan.fresh.get(entry);
                    if (fresh === undefined) plan.fresh.set(entry, fresh = []);
                    fresh.push(id);
                }
                to = withComponent(state, to, id);
            }
            plan.to[entry] = to.id;
            if (end > start) addRange(entry, b, start, end);
        }
    }
};

const remove = (state: State, archetype: Archetype, row: number): void => {
    const moved = swapRemove(archetype, row);
    if (moved !== -1) state.entities.row[indexOf(moved)] = row;
};

const writeRange = (buffer: CommandBuffer, start: number, end: number, to: Archetype, toRow: number, from: Archetype | null, fresh: readonly number[] | undefined, tick: number): void => {
    const { ids, values } = buffer;
    for (let k = start; k < end; k++) {
        const id = ids[k];
        const storage = to.storageById[id];
        if (storage === undefined) continue;
        writeCell(storage, toRow, values[k]);
        storage.changed[toRow] = tick;
        if (from === null || from.storageById[id] === undefined || (fresh !== undefined && fresh.includes(id))) storage.added[toRow] = tick;
    }
};

const applyEntry = (state: State, queued: readonly Queued[], entry: number, tick: number): void => {
    const { entities, archetypes } = state;
    const entity = plan.entity[entry];
    const index = indexOf(entity);
    const from = plan.from[entry] < 0 ? null : archetypes[plan.from[entry]];
    if (plan.despawned[entry] === 1) {
        if (from !== null) remove(state, from, entities.row[index]);
        release(entities, index);
        return;
    }
    const to = archetypes[plan.to[entry]];
    const fromRow = from === null ? -1 : entities.row[index];
    const toRow = to === from ? fromRow : insertRow(state.memory, to, entity);
    if (from !== null && to !== from) for (const [source, target] of movesOf(from, to)) copyCell(source, fromRow, target, toRow);
    if (plan.start[entry] >= 0) {
        const fresh = plan.fresh.get(entry);
        writeRange(queued[plan.buffer[entry]].buffer, plan.start[entry], plan.end[entry], to, toRow, from, fresh, tick);
        const more = plan.more.get(entry);
        if (more !== undefined) for (let r = 0; r < more.length; r += 3) writeRange(queued[more[r]].buffer, more[r + 1], more[r + 2], to, toRow, from, fresh, tick);
    }
    if (from !== null && to !== from) remove(state, from, fromRow);
    entities.archetype[index] = to.id;
    entities.row[index] = toRow;
};

/** Applies every queued command as one sync point with a new tick, then empties the queue. */
export const synchronize = (state: State): void => {
    const queued = state.queued;
    if (queued.every(({ buffer }) => buffer.kinds.length === 0) && !reserved(state.entities)) {
        queued.length = 0;
        return;
    }
    const reservations = materialize(state.memory, state.entities);
    plan.count = 0;
    planOf(state, queued);
    const tick = ++state.tick;
    for (let entry = 0; entry < plan.count; entry++) applyEntry(state, queued, entry, tick);
    // A reservation whose spawn never arrived, from a chunk that failed after reserving, would otherwise leak its index.
    const leaked = (index: number): boolean => index >= slots.length || slots[index] < 0;
    for (const index of reservations.reused) if (leaked(index)) release(state.entities, index);
    for (let index = reservations.firstNew; index < state.entities.length; index++) if (leaked(index)) release(state.entities, index);
    for (let entry = 0; entry < plan.count; entry++) slots[indexOf(plan.entity[entry])] = -1;
    plan.more.clear();
    plan.fresh.clear();
    queued.length = 0;
    recycle(state.memory, state.entities);
};
