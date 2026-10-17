import { copyCell, ensureCapacity, insertRow, swapRemove, writeF32, writeF32Lanes, writeF64, writeI32, writeU32, type Archetype, type Storage } from './archetype.js';
import { chunkShift } from './kernel.js';
import { clearBuffer, despawnCommand, endOf, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { readCell, writeCell } from './cells.js';
import { commitBatches } from './batches.js';
import { applyIndexChanges, cascadeReferences, indexChangesOf, type IndexChanges, type Written } from './cascade.js';
import { refreshDirectories } from './directories.js';
import { record } from './journal.js';
import { indexOf, locate, materialize, recycle, release, reserved, type Reserved } from './entities.js';
import { activate } from './activate.js';
import { runFinalizers } from './finalizers.js';
import { defaultOf } from './resources.js';
import { closureOf, derives, gainsOf } from './structure.js';
import { archetypeOf, movesOf, withComponent, withoutComponent, type State } from './state.js';

/** Buffers queued for the next sync point, in merge order. Commands in guarded buffers can't touch the resource entity. */
export type Queued = { readonly buffer: CommandBuffer; readonly guarded: boolean };

const grownInt32 = (array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> => {
    const grown = new Int32Array(length);
    grown.set(array);
    return grown;
};

const ensurePlanCapacity = (state: State): void => {
    const { plan } = state;
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

const addEntry = (state: State, entity: number, index: number, from: number, to: number): number => {
    ensurePlanCapacity(state);
    const { plan } = state;
    const entry = plan.count++;
    plan.entity[entry] = entity;
    plan.from[entry] = from;
    plan.to[entry] = to;
    plan.despawned[entry] = 0;
    plan.start[entry] = plan.end[entry] = -1;
    plan.slots[index] = entry;
    return entry;
};

const addRange = (state: State, entry: number, buffer: number, start: number, end: number): void => {
    const { plan } = state;
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

/** The entry of a live entity, added unchanged if it has none; -1 for an entity that isn't alive. */
const entryOf = (state: State, entity: number): number => {
    const index = indexOf(entity);
    const existing = state.plan.slots[index];
    if (existing >= 0) return state.plan.entity[existing] === entity ? existing : -1;
    if (locate(state.entities, entity) < 0) return -1;
    const from = state.entities.archetype[index];
    return addEntry(state, entity, index, from, from);
};

/** Removes the components declared within `id` from `to`, transitively, as removing their host does. */
const withoutDependents = (state: State, to: Archetype, id: number): Archetype => {
    let result = to;
    for (const dependent of state.structure.dependents[id] ?? []) {
        if (result.storageById[dependent] === undefined) continue;
        result = withoutDependents(state, withoutComponent(state, result, dependent), dependent);
    }
    return result;
};

/**
 * Plan: the net change for each entity, in issue order. Commands against dead entities do nothing. Reference values
 * written by commands go to `written`, to check once despawns are known.
 */
const planOf = (state: State, queued: readonly Queued[], written: Written): void => {
    const { plan, structure } = state;
    if (plan.slots.length < state.entities.length) plan.slots = new Int32Array(Math.max(state.entities.length, plan.slots.length * 2)).fill(-1);
    const { slots, shapes } = plan;
    const empty = archetypeOf(state, []).id;
    const { archetypes } = state;
    const within = derives(structure);
    const references = structure.referenceIds.length > 0;
    let cached = 0;
    let replace = 0;
    for (let b = 0; b < queued.length; b++) {
        const { buffer, guarded } = queued[b];
        const { kinds, entities, starts, ids, values } = buffer;
        for (let command = 0; command < buffer.count; command++) {
            const kind = kinds[command];
            const entity = entities[command];
            if (guarded && entity === state.resourceEntity) continue;
            const index = indexOf(entity);
            let entry: number;
            if (kind === spawnCommand) {
                entry = addEntry(state, entity, index, -1, empty);
                plan.spawned++;
                const start = starts[command];
                const end = endOf(buffer, command);
                const length = end - start;
                let hit = -1;
                for (let c = 0; c < cached && hit < 0; c++) {
                    const shape = shapes[c];
                    if (shape.end - shape.start !== length) continue;
                    let same = true;
                    for (let k = 0; k < length && same; k++) same = ids[start + k] === shape.ids[shape.start + k];
                    if (same) hit = c;
                }
                if (hit >= 0) plan.to[entry] = shapes[hit].target;
                else {
                    let to = archetypes[empty];
                    for (let k = start; k < end; k++) to = withComponent(state, to, ids[k]);
                    plan.to[entry] = to.id;
                    const shape = shapes[replace];
                    shape.ids = ids;
                    shape.start = start;
                    shape.end = end;
                    shape.target = to.id;
                    replace = (replace + 1) % shapes.length;
                    cached = Math.min(cached + 1, shapes.length);
                }
                if (end > start) addRange(state, entry, b, start, end);
                if (references) for (let k = start; k < end; k++) if (structure.references[ids[k]] !== 0) written.push(entity, ids[k], Number(values[k]));
                continue;
            }
            else {
                entry = slots[index];
                if (entry >= 0) {
                    if (plan.entity[entry] !== entity || plan.despawned[entry] === 1) continue;
                }
                else {
                    if (locate(state.entities, entity) < 0) continue;
                    const from = state.entities.archetype[index];
                    entry = addEntry(state, entity, index, from, from);
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
                for (let k = start; k < end; k++) {
                    to = withoutComponent(state, to, ids[k]);
                    if (within) to = withoutDependents(state, to, ids[k]);
                }
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
                if (references && structure.references[id] !== 0) written.push(entity, id, Number(values[k]));
            }
            plan.to[entry] = to.id;
            if (end > start) addRange(state, entry, b, start, end);
        }
    }
};

const remove = (state: State, archetype: Archetype, row: number): void => {
    const moved = swapRemove(archetype, row);
    if (moved === -1) return;
    state.entities.row[indexOf(moved)] = row;
    // Its row changed, so what `up` keeps of it does.
    record(state.journal, indexOf(moved), state.entities.length);
};

const writeRange = (buffer: CommandBuffer, start: number, end: number, to: Archetype, toRow: number, from: Archetype | null, fresh: readonly number[] | undefined, tick: number): void => {
    const { ids, values } = buffer;
    for (let k = start; k < end; k++) {
        const id = ids[k];
        const storage = to.storageById[id];
        if (storage === undefined) continue;
        const value = values[k];
        // Inline, not a closure call: common layouts store straight into their view; the rest use the layout's writer.
        const { views } = storage;
        const index = toRow * storage.unitStride + storage.unitOffset;
        switch (storage.write) {
            case writeF32: if (typeof value === "number") views.f32[index] = value; else writeCell(storage, toRow, value); break;
            case writeU32: if (typeof value === "number") views.u32[index] = value; else writeCell(storage, toRow, value); break;
            case writeI32: if (typeof value === "number") views.i32[index] = value; else writeCell(storage, toRow, value); break;
            case writeF64: if (typeof value === "number") views.f64[index] = value; else writeCell(storage, toRow, value); break;
            case writeF32Lanes:
                if (Array.isArray(value)) for (let lane = 0; lane < storage.lanes; lane++) views.f32[index + lane] = Number(value[lane]);
                else writeCell(storage, toRow, value);
                break;
            default: writeCell(storage, toRow, value);
        }
        if (!storage.ticked) continue;
        const starts = from === null || from.storageById[id] === undefined || (fresh !== undefined && fresh.includes(id));
        // A constant's `changed` ticks are its `added` ticks, and its value can't change: only a new start stamps it.
        if (storage.changed !== storage.added || starts) {
            storage.changed[toRow] = tick;
            storage.chunkChanged[toRow >> chunkShift] = tick;
        }
        if (starts) {
            storage.added[toRow] = tick;
            storage.chunkAdded[toRow >> chunkShift] = tick;
        }
    }
};

/** Writes a derived component's default into a row it starts in, stamped as added. */
export const writeDefault = (state: State, storage: Storage, row: number, tick: number): void => {
    writeCell(storage, row, defaultOf(state.keys[storage.component]));
    if (!storage.ticked) return;
    storage.added[row] = storage.changed[row] = tick;
    storage.chunkAdded[row >> chunkShift] = storage.chunkChanged[row >> chunkShift] = tick;
};

const applyEntry = (state: State, queued: readonly Queued[], entry: number, tick: number, deriving: boolean): void => {
    const { entities, archetypes, plan } = state;
    const entity = plan.entity[entry];
    const index = indexOf(entity);
    const from = plan.from[entry] < 0 ? null : archetypes[plan.from[entry]];
    if (plan.despawned[entry] === 1 || plan.to[entry] !== plan.from[entry]) record(state.journal, index, entities.length);
    if (plan.despawned[entry] === 1) {
        if (from !== null) {
            remove(state, from, entities.row[index]);
            state.touched?.add(from);
        }
        release(entities, index);
        return;
    }
    const to = archetypes[plan.to[entry]];
    const fromRow = from === null ? -1 : entities.row[index];
    const toRow = to === from ? fromRow : insertRow(state.memory, to, entity);
    if (from !== null && to !== from) {
        const moves = movesOf(from, to);
        for (let m = 0; m < moves.length; m += 2) copyCell(moves[m], fromRow, moves[m + 1], toRow);
    }
    // Rows are reused after swap-removes, so a derived component starting here gets its default written.
    if (deriving && to !== from) {
        for (const id of gainsOf(state.structure, state.derived, from, to)) {
            const storage = to.storageById[id];
            if (storage !== undefined) writeDefault(state, storage, toRow, tick);
        }
    }
    if (plan.start[entry] >= 0) {
        const fresh = plan.fresh.size === 0 ? undefined : plan.fresh.get(entry);
        writeRange(queued[plan.buffer[entry]].buffer, plan.start[entry], plan.end[entry], to, toRow, from, fresh, tick);
        const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
        if (more !== undefined) for (let r = 0; r < more.length; r += 3) writeRange(queued[more[r]].buffer, more[r + 1], more[r + 2], to, toRow, from, fresh, tick);
    }
    if (from !== null && to !== from) remove(state, from, fromRow);
    if (state.touched !== null) {
        state.touched.add(to);
        if (from !== null) state.touched.add(from);
    }
    entities.archetype[index] = to.id;
    entities.row[index] = toRow;
};

/** Grows each archetype once to fit the entities moving or spawning into it. */
const presize = (state: State): void => {
    const { plan } = state;
    const incoming = new Int32Array(state.archetypes.length);
    for (let entry = 0; entry < plan.count; entry++) if (plan.despawned[entry] === 0 && plan.from[entry] !== plan.to[entry]) incoming[plan.to[entry]]++;
    for (let id = 0; id < incoming.length; id++) {
        const archetype = state.archetypes[id];
        if (incoming[id] > 0) ensureCapacity(state.memory, archetype, archetype.count + incoming[id]);
    }
};

const merged = (carried: Reserved | null, reservations: Reserved): Reserved => carried === null ? reservations
    : { reused: [...carried.reused, ...reservations.reused], firstNew: Math.min(carried.firstNew, reservations.firstNew) };

/** Every live entity whose archetype's closure differs gets an entry, after rules were registered. */
const rederive = (state: State): void => {
    const { structure, archetypes } = state;
    structure.rederive = false;
    for (const archetype of [...archetypes]) {
        if (archetype.resource || archetype.count === 0) continue;
        const closed = closureOf(structure, state.derived, archetype, components => archetypeOf(state, components), archetypes);
        if (closed === archetype) continue;
        for (let row = 0; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            if (state.plan.slots[indexOf(entity)] < 0) addEntry(state, entity, indexOf(entity), archetype.id, archetype.id);
        }
    }
};

/** Undoes a planned sync point's shared state, after it applied or failed. */
const cleanUp = (state: State, queued: readonly Queued[]): void => {
    const { plan } = state;
    // The plan's arrays are reused by the next sync point, so they're always left clean, even after a throw.
    for (let entry = 0; entry < plan.count; entry++) plan.slots[indexOf(plan.entity[entry])] = -1;
    plan.count = 0;
    plan.spawned = 0;
    plan.more.clear();
    plan.fresh.clear();
    // Systems reuse their buffers next run.
    for (const { buffer } of queued) clearBuffer(buffer);
    refreshDirectories(state);
    state.syncing = null;
};

/**
 * The first half of a sync point: commits batch spawns, plans every command, cascades references and closes the plan
 * under rules. Nothing that exists moves yet, so the GPU can read back what the plan disturbs before `applySync`.
 * Returns false when there's nothing to apply. An `isolated` one applies only the queued buffers, without batches,
 * re-deriving or finalizers, for registration's own changes between runs.
 */
export const prepareSync = (state: State, isolated = false): boolean => {
    if (!isolated) activate(state);
    // Taken first, so a sync point that throws can't replay its commands into the next one.
    const queued = state.queued.splice(0);
    const { structure, plan } = state;
    // Finalizers' spawns are reserved during the last sync point, so their batches are pending without a reservation.
    if (queued.every(({ buffer }) => buffer.count === 0) && !reserved(state.entities) && state.carried === null && !structure.rederive) return false;
    plan.count = 0;
    plan.spawned = 0;
    let reservations: Reserved | null = null;
    try {
        reservations = merged(state.carried, materialize(state.memory, state.entities));
        state.carried = null;
        const tick = ++state.tick;
        const deriving = derives(structure);
        const close = (archetype: Archetype): Archetype => closureOf(structure, state.derived, archetype, components => archetypeOf(state, components), state.archetypes);
        const born = new Map<number, number>();
        // Before the plan, so commands against staged entities find them, and before any growth, which copies `count` rows.
        if (!isolated) plan.spawned += commitBatches(state, tick, born, deriving ? close : null);
        const written: Written = [];
        planOf(state, queued, written);
        if (structure.rederive && !isolated) rederive(state);
        if (deriving) for (let entry = 0; entry < plan.count; entry++) if (plan.despawned[entry] === 0) plan.to[entry] = close(state.archetypes[plan.to[entry]]).id;
        let index: IndexChanges | null = null;
        if (structure.referenceIds.length > 0) {
            for (const [id, first] of born) {
                const archetype = state.archetypes[id];
                for (const component of structure.referenceIds) {
                    const storage = archetype.storageById[component];
                    if (storage === undefined) continue;
                    for (let row = first; row < archetype.count; row++) written.push(archetype.entities[row], component, Number(readCell(storage, row)));
                }
            }
            cascadeReferences(state, queued, written, entity => entryOf(state, entity));
            const fromOf = (entry: number): Archetype | null => {
                const from = plan.from[entry];
                if (from < 0) return null;
                const first = born.get(from);
                return first !== undefined && state.entities.row[indexOf(plan.entity[entry])] >= first ? null : state.archetypes[from];
            };
            index = indexChangesOf(state, queued, fromOf, [...born].map(([id, first]) => [state.archetypes[id], first] as const));
        }
        // References change only here: each component written to is stamped, and each holder journaled, as are spawns.
        for (let k = 1; k < written.length; k += 3) state.referencesWritten[written[k]] = tick;
        if (state.journal.readers > 0) {
            for (let k = 0; k < written.length; k += 3) record(state.journal, indexOf(written[k]), state.entities.length);
            for (const [id, first] of born) {
                const archetype = state.archetypes[id];
                for (let row = first; row < archetype.count; row++) record(state.journal, indexOf(archetype.entities[row]), state.entities.length);
            }
        }
        presize(state);
        state.syncing = { queued, reservations, reserved: state.entities.length, tick, born, index, deriving, isolated };
        return true;
    }
    catch (error) {
        // The next sync point's leak scan frees reservations whose spawns this one dropped.
        if (reservations !== null) state.carried = reservations;
        cleanUp(state, queued);
        throw error;
    }
};

/**
 * The second half: runs finalizers against the plan, then applies it. A finalizer that throws doesn't stop the sync
 * point; the first error is thrown once it has applied.
 */
export const applySync = (state: State): void => {
    const syncing = state.syncing;
    if (syncing === null) return;
    const { queued, reservations, tick, born, index, deriving, isolated } = syncing;
    const tableLength = syncing.reserved;
    const { plan } = state;
    let errors: unknown[] = [];
    try {
        if (state.finalizers.length > 0 && !isolated) {
            errors = runFinalizers(state, queued, born);
            // Finalizers reserve entities for their spawns; the next sync point accounts for them.
            if (reserved(state.entities)) state.carried = materialize(state.memory, state.entities);
        }
        for (let entry = 0; entry < plan.count; entry++) applyEntry(state, queued, entry, tick, deriving);
        if (index !== null) applyIndexChanges(state, index);
        // A reservation whose spawn never arrived, from a chunk that failed after reserving, would otherwise leak its index.
        // Every spawn consumes one reservation, so only a shortfall needs the scan.
        // Finalizers' reservations came after, so they're left for the next sync point.
        if (plan.spawned < reservations.reused.length + tableLength - reservations.firstNew) {
            const leaked = (index: number): boolean => (index >= plan.slots.length || plan.slots[index] < 0) && state.entities.archetype[index] < 0;
            for (const index of reservations.reused) if (leaked(index)) release(state.entities, index);
            for (let index = reservations.firstNew; index < tableLength; index++) if (leaked(index)) release(state.entities, index);
        }
        recycle(state.memory, state.entities);
    }
    finally {
        cleanUp(state, queued);
    }
    // Only after a sync point that applied, so a failing one keeps its own error.
    for (const after of state.afterSync) after();
    if (errors.length > 0) throw errors[0];
};

/** Applies every queued command as one sync point with a new tick, then empties the queue. */
export const synchronize = (state: State): void => {
    if (prepareSync(state)) applySync(state);
};

/**
 * Applies `buffer` alone as a sync point, leaving what's pending for the next run's: registration's changes between
 * runs, which no finalizer sees.
 */
export const synchronizeAlone = (state: State, buffer: CommandBuffer): void => {
    const pending = state.queued.splice(0);
    const carried = state.carried;
    state.carried = null;
    state.queued.push({ buffer, guarded: false });
    try {
        if (prepareSync(state, true)) applySync(state);
    }
    finally {
        state.queued.push(...pending);
        // An isolated sync point runs no finalizers, so it reserves nothing for the next one.
        state.carried = carried;
    }
};
