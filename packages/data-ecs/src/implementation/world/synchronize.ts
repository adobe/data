import type { Views } from '../../interface/registry/layout.js';
import { copyValue, ensureCapacity, swapRemove, writeF32, writeF32Lanes, writeF64, writeI32, writeU32, type Archetype, type Storage } from './archetype.js';
import { chunkShift } from './kernel.js';
import { clearBuffer, despawnCommand, endOf, referenceAt, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { readCell, writeCell } from './cells.js';
import { commitBatches, commitStaged } from './batches.js';
import { applyIndexChanges, cascadeReferences, indexChangesOf, type IndexChanges, type Written } from './cascade.js';
import { refreshDirectories } from './directories.js';
import { beginStructure, countChanged, endStructure, flushDirectory } from './layout-directory.js';
import { beginLog, logAppend, logMove, logSet, logSwap, publishLog, startTag, tagOf } from './move-log.js';
import { record } from './journal.js';
import { indexOf, locate, materialize, recycle, release, reserved, unreserve, type Reserved } from './entities.js';
import { activate } from './activate.js';
import { runFinalizers, type Thrown } from './finalizers.js';
import { closureOf, derives, gainsOf } from './structure.js';
import type { Plan } from './plan.js';
import type { MoveLog } from './move-log.js';
import { archetypeOf, defaultOf, movesOf, withComponent, withoutComponent, type State } from './state.js';

/** Buffers queued for the next sync point, in merge order. Commands in guarded buffers can't touch the resource entity. */
export type Queued = { readonly buffer: CommandBuffer; readonly guarded: boolean };

const grownInt32 = (array: Int32Array<ArrayBuffer>, length: number): Int32Array<ArrayBuffer> => {
    const grown = new Int32Array(length);
    grown.set(array);
    return grown;
};

/** Grows the plan to hold `needed` entries. */
const ensurePlanCapacity = (state: State, needed: number): void => {
    const { plan } = state;
    if (needed <= plan.entity.length) return;
    let length = plan.entity.length * 2;
    while (length < needed) length *= 2;
    const entity = new Float64Array(length);
    entity.set(plan.entity);
    plan.entity = entity;
    const despawned = new Uint8Array(length);
    despawned.set(plan.despawned);
    plan.despawned = despawned;
    plan.from = grownInt32(plan.from, length);
    plan.to = grownInt32(plan.to, length);
    plan.row = grownInt32(plan.row, length);
    plan.pair = grownInt32(plan.pair, length);
    plan.buffer = grownInt32(plan.buffer, length);
    plan.start = grownInt32(plan.start, length);
    plan.end = grownInt32(plan.end, length);
};

const addEntry = (state: State, entity: number, index: number, from: number, to: number): number => {
    ensurePlanCapacity(state, state.plan.count + 1);
    return addPlanned(state, entity, index, from, to);
};

/** Adds an entry to a plan already grown to hold it. */
const addPlanned = (state: State, entity: number, index: number, from: number, to: number): number => {
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
    const { slots } = plan;
    const empty = archetypeOf(state, []).id;
    const { archetypes } = state;
    const within = derives(structure);
    const references = structure.referenceIds.length > 0;
    for (let b = 0; b < queued.length; b++) {
        const { buffer, guarded } = queued[b];
        const { kinds, entities, starts, ids } = buffer;
        // Each command adds at most one entry.
        ensurePlanCapacity(state, plan.count + buffer.count);
        for (let command = 0; command < buffer.count; command++) {
            const kind = kinds[command];
            const entity = entities[command];
            if (guarded && entity === state.resourceEntity) continue;
            const index = indexOf(entity);
            let entry: number;
            // Only the world spawns through a command, its resource entity: systems' and kernels' spawns are staged.
            if (kind === spawnCommand) {
                entry = addPlanned(state, entity, index, -1, empty);
                plan.spawned++;
                const start = starts[command];
                const end = endOf(buffer, command);
                let to = archetypes[empty];
                for (let k = start; k < end; k++) to = withComponent(state, to, ids[k]);
                plan.to[entry] = to.id;
                if (end > start) addRange(state, entry, b, start, end);
                if (references) for (let k = start; k < end; k++) if (structure.references[ids[k]] !== 0) written.push(entity, ids[k], referenceAt(buffer, k));
                continue;
            }
            else {
                entry = slots[index];
                if (entry >= 0) {
                    if (plan.entity[entry] !== entity || plan.despawned[entry] === 1) {
                        plan.dropped++;
                        continue;
                    }
                }
                else {
                    if (locate(state.entities, entity) < 0) {
                        plan.dropped++;
                        continue;
                    }
                    const from = state.entities.archetype[index];
                    entry = addPlanned(state, entity, index, from, from);
                }
            }
            if (kind === despawnCommand) {
                plan.despawned[entry] = 1;
                continue;
            }
            const start = starts[command];
            const end = endOf(buffer, command);
            let to = archetypes[plan.to[entry]];
            // A list's command resolves its target from each source archetype once.
            const shape = buffer.shapes[command] < 0 ? null : state.shapes[buffer.shapes[command]];
            if (kind === removeCommand) {
                const known = shape === null ? undefined : shape.removing[to.id];
                if (known !== undefined) {
                    plan.to[entry] = known;
                    continue;
                }
                const source = to.id;
                for (let k = start; k < end; k++) {
                    to = withoutComponent(state, to, ids[k]);
                    if (within) to = withoutDependents(state, to, ids[k]);
                }
                if (shape !== null) shape.removing[source] = to.id;
                plan.to[entry] = to.id;
                continue;
            }
            const from = plan.from[entry] < 0 ? null : archetypes[plan.from[entry]];
            const known = shape === null ? undefined : shape.adding[to.id];
            const source = to.id;
            for (let k = start; k < end; k++) {
                const id = ids[k];
                // Removed earlier in this sync point and added again: a new start, so a new `added` tick.
                if (from !== null && from !== to && to.storageById[id] === undefined && from.storageById[id] !== undefined) {
                    let fresh = plan.fresh.get(entry);
                    if (fresh === undefined) plan.fresh.set(entry, fresh = []);
                    fresh.push(id);
                }
                if (known === undefined) to = withComponent(state, to, id);
                if (references && structure.references[id] !== 0) written.push(entity, id, referenceAt(buffer, k));
            }
            if (known !== undefined) to = archetypes[known];
            else if (shape !== null) shape.adding[source] = to.id;
            plan.to[entry] = to.id;
            if (end > start) addRange(state, entry, b, start, end);
        }
    }
};

/** Copies a value's bytes, in its storage's layout, into row `row`: by 32-bit word where its layout has whole words. */
const copyBytes = (storage: Storage, row: number, bytes: Views, offset: number): void => {
    const { words } = storage;
    if (words > 0) {
        const target = storage.views.u32;
        const source = bytes.u32;
        const to = row * words;
        const from = offset >> 2;
        for (let i = 0; i < words; i++) target[to + i] = source[from + i];
        return;
    }
    const stride = storage.layout.kind === "linear" ? storage.layout.stride : 0;
    const target = storage.views.u8;
    const source = bytes.u8;
    for (let i = 0; i < stride; i++) target[row * stride + i] = source[offset + i];
};

/** A joined thread's object: its tag here, its value given there. */
const writeRemote = (storage: Storage, log: MoveLog, value: unknown, to: Archetype, toRow: number, from: Archetype | null, fresh: readonly number[] | undefined): void => {
    const id = storage.component;
    const tag = tagOf(value, log.starts[id]);
    storage.tags[toRow] = tag;
    logSet(log, to.id, toRow, id, tag, from === null || from.storageById[id] === undefined || (fresh !== undefined && fresh.includes(id)));
};

const writeRange = (buffer: CommandBuffer, start: number, end: number, to: Archetype, toRow: number, from: Archetype | null, fresh: readonly number[] | undefined, tick: number): void => {
    const { ids, values, bytes, offsets } = buffer;
    for (let k = start; k < end; k++) {
        const id = ids[k];
        const storage = to.storageById[id];
        if (storage === undefined) continue;
        const value = values[k];
        // Inline, not a closure call: common layouts store straight into their view; the rest use the layout's writer.
        const { views } = storage;
        const index = toRow * storage.unitStride + storage.unitOffset;
        // A worker's structs arrive as bytes in their storage's layout.
        if (bytes !== null && offsets[k] >= 0) copyBytes(storage, toRow, bytes, offsets[k]);
        else switch (storage.write) {
            case writeF32: if (typeof value === "number") views.f32[index] = value; else writeCell(storage, toRow, value); break;
            case writeU32: if (typeof value === "number") views.u32[index] = value; else writeCell(storage, toRow, value); break;
            case writeI32: if (typeof value === "number") views.i32[index] = value; else writeCell(storage, toRow, value); break;
            case writeF64: if (typeof value === "number") views.f64[index] = value; else writeCell(storage, toRow, value); break;
            case writeF32Lanes:
                if (Array.isArray(value)) for (let lane = 0; lane < storage.lanes; lane++) views.f32[index + lane] = Number(value[lane]);
                else writeCell(storage, toRow, value);
                break;
            default:
                if (storage.remote === null) writeCell(storage, toRow, value);
                else writeRemote(storage, storage.remote, value, to, toRow, from, fresh);
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
    // A joined thread's object starts there, as the row's move or append says.
    if (storage.remote === null) writeCell(storage, row, defaultOf(state.keys[storage.component]));
    else storage.tags[row] = startTag;
    if (!storage.ticked) return;
    storage.added[row] = storage.changed[row] = tick;
    storage.chunkAdded[row >> chunkShift] = storage.chunkChanged[row >> chunkShift] = tick;
};

/** Writes the values an entry's commands give into its row, in issue order. */
const writeValues = (state: State, queued: readonly Queued[], entry: number, to: Archetype, toRow: number, from: Archetype | null, tick: number): void => {
    const { plan } = state;
    if (plan.start[entry] < 0) return;
    const fresh = plan.fresh.size === 0 ? undefined : plan.fresh.get(entry);
    writeRange(queued[plan.buffer[entry]].buffer, plan.start[entry], plan.end[entry], to, toRow, from, fresh, tick);
    const more = plan.more.size === 0 ? undefined : plan.more.get(entry);
    if (more !== undefined) for (let r = 0; r < more.length; r += 3) writeRange(queued[more[r]].buffer, more[r + 1], more[r + 2], to, toRow, from, fresh, tick);
};

/**
 * The first pass of applying: a despawned entity is released, keeping in `plan.row` the row it leaves, and one staying
 * in its archetype gets its values written. Each moving entry, spawns included, joins the pair of archetypes it moves
 * between, keeping the row it leaves.
 */
const sort = (state: State, queued: readonly Queued[], tick: number): void => {
    const { entities, archetypes, plan } = state;
    const { pairs } = plan;
    const width = archetypes.length + 1;
    let lastKey = -1;
    let lastPair = -1;
    /** The last entry that joined a pair, to tell whether each pair's entries are consecutive. */
    let lastJoined = -2;
    let ranges = true;
    let leaving = 0;
    for (let entry = 0; entry < plan.count; entry++) {
        const index = indexOf(plan.entity[entry]);
        const fromId = plan.from[entry];
        const fromRow = fromId < 0 ? -1 : entities.row[index];
        plan.pair[entry] = -1;
        if (plan.despawned[entry] === 1) {
            record(state.journal, index, entities.length);
            plan.row[entry] = fromRow;
            if (fromRow >= 0) leaving++;
            if (fromId >= 0) state.touched?.add(archetypes[fromId]);
            if (fromId >= 0 && state.claimed) countChanged(state.counted, archetypes[fromId]);
            release(entities, index);
            continue;
        }
        const toId = plan.to[entry];
        if (toId === fromId) {
            plan.row[entry] = -1;
            const archetype = archetypes[toId];
            writeValues(state, queued, entry, archetype, fromRow, archetype, tick);
            state.touched?.add(archetype);
            continue;
        }
        record(state.journal, index, entities.length);
        plan.row[entry] = fromRow;
        if (fromRow >= 0) leaving++;
        const key = (fromId + 1) * width + toId;
        // Entries of one pair usually come together, as a system's commands over one archetype do.
        let pair = key === lastKey ? lastPair : pairs.byKey.get(key);
        if (pair === undefined) {
            pair = pairs.from.length;
            pairs.byKey.set(key, pair);
            pairs.from.push(fromId);
            pairs.to.push(toId);
            pairs.count.push(0);
            pairs.start.push(entry);
        }
        else if (pair !== lastPair || entry !== lastJoined + 1) ranges = false;
        lastKey = key;
        lastPair = pair;
        lastJoined = entry;
        plan.pair[entry] = pair;
        pairs.count[pair]++;
    }
    pairs.leaving = leaving;
    if (pairs.order.length < plan.count) pairs.order = new Int32Array(Math.max(plan.count, pairs.order.length * 2));
    const { order } = pairs;
    // Each pair's block is its own range of entries.
    if (ranges) {
        for (let entry = 0; entry < plan.count; entry++) order[entry] = entry;
        return;
    }
    let start = 0;
    for (let pair = 0; pair < pairs.count.length; pair++) {
        pairs.start[pair] = start;
        start += pairs.count[pair];
        pairs.count[pair] = 0;
    }
    for (let entry = 0; entry < plan.count; entry++) {
        const pair = plan.pair[entry];
        if (pair >= 0) order[pairs.start[pair] + pairs.count[pair]++] = entry;
    }
};

/** Copies one column's cells for a block of moving rows, the row entry `order[first + k]` leaves to `toStart + k`, values and ticks. */
const copyColumn = (from: Storage, to: Storage, plan: Plan, order: Int32Array, first: number, count: number, toStart: number): void => {
    const { words } = from;
    if (words > 0) {
        const source = from.views.u32;
        const target = to.views.u32;
        for (let k = 0; k < count; k++) {
            const s = plan.row[order[first + k]] * words;
            const t = (toStart + k) * words;
            for (let i = 0; i < words; i++) target[t + i] = source[s + i];
        }
    }
    else if (from.layout.kind === "linear" || from.layout.kind === "object") {
        for (let k = 0; k < count; k++) copyValue(from, plan.row[order[first + k]], to, toStart + k);
    }
    if (!to.ticked) return;
    for (let k = 0; k < count; k++) {
        const fromRow = plan.row[order[first + k]];
        const toRow = toStart + k;
        const added = from.added[fromRow];
        const changed = from.changed[fromRow];
        to.added[toRow] = added;
        to.changed[toRow] = changed;
        // A chunk's tick is the newest of its rows, so a row moving in can raise it.
        const chunk = toRow >> chunkShift;
        if (added > to.chunkAdded[chunk]) to.chunkAdded[chunk] = added;
        if (changed > to.chunkChanged[chunk]) to.chunkChanged[chunk] = changed;
    }
};

/**
 * A pair's rows arriving, once a joined thread may read: the counts that changed, and in an archetype holding joined
 * threads' objects, for each thread's log, moves from an archetype holding its objects too, else appends, each of the
 * thread's objects the row gains at its start.
 */
const noteArrivals = (state: State, from: Archetype | null, to: Archetype, first: number, count: number, toStart: number): void => {
    countChanged(state.counted, to);
    if (from !== null) countChanged(state.counted, from);
    const { logs } = to;
    if (logs === null) return;
    const { plan } = state;
    const { order } = plan.pairs;
    for (const log of logs) {
        const moving = from !== null && from.logs !== null && from.logs.includes(log);
        for (let k = 0; k < count; k++) {
            const entry = order[first + k];
            if (moving) logMove(log, from.id, plan.row[entry], to.id, toStart + k);
            else logAppend(log, to.id, toStart + k, plan.entity[entry]);
        }
    }
};

/**
 * The second pass: each pair's entries arrive as one block of rows at the end of their target, which presizing made
 * room for. The pair resolves once the cells its archetypes share and the derived components the target adds, and
 * copies them column by column; then each entry's values are written and its entity placed.
 */
const arrive = (state: State, queued: readonly Queued[], tick: number, deriving: boolean): void => {
    const { entities, archetypes, plan } = state;
    const { pairs } = plan;
    const { order } = pairs;
    for (let pair = 0; pair < pairs.from.length; pair++) {
        const from = pairs.from[pair] < 0 ? null : archetypes[pairs.from[pair]];
        const to = archetypes[pairs.to[pair]];
        const first = pairs.start[pair];
        const count = pairs.count[pair];
        const toStart = to.count;
        for (let k = 0; k < count; k++) to.entities[toStart + k] = plan.entity[order[first + k]];
        to.count += count;
        if (from !== null) {
            const moves = movesOf(from, to);
            for (let m = 0; m < moves.length; m += 2) copyColumn(moves[m], moves[m + 1], plan, order, first, count, toStart);
        }
        if (state.claimed) noteArrivals(state, from, to, first, count, toStart);
        // Rows are reused after swap-removes, so a derived component starting here gets its default written.
        if (deriving) {
            for (const id of gainsOf(state.structure, state.derived, from, to)) {
                const storage = to.storageById[id];
                if (storage !== undefined) for (let k = 0; k < count; k++) writeDefault(state, storage, toStart + k, tick);
            }
        }
        for (let k = 0; k < count; k++) {
            const entry = order[first + k];
            const index = indexOf(plan.entity[entry]);
            writeValues(state, queued, entry, to, toStart + k, from, tick);
            entities.archetype[index] = to.id;
            entities.row[index] = toStart + k;
        }
        if (state.touched !== null) {
            state.touched.add(to);
            if (from !== null) state.touched.add(from);
        }
    }
};

/**
 * Removes the row an entry left, by moving its archetype's last row into it. Entries are removed last first, so
 * rows they left at the end of an archetype, as a whole archetype moving out leaves them, are dropped without a copy.
 * A row moved into the hole that another entry still leaves takes that entry's place; any other's entity is updated.
 */
const leave = (state: State, entry: number): void => {
    const { plan } = state;
    const row = plan.row[entry];
    if (row < 0) return;
    const from = state.archetypes[plan.from[entry]];
    const moved = swapRemove(from, row);
    if (moved === -1) return;
    const index = indexOf(moved);
    const other = plan.slots[index];
    if (other >= 0 && plan.entity[other] === moved && plan.row[other] >= 0 && plan.from[other] === from.id) plan.row[other] = row;
    else {
        state.entities.row[index] = row;
        // Its row changed, so what `up` keeps of it does.
        record(state.journal, index, state.entities.length);
    }
};

/** `leave`, once a joined thread may read: a row removed from an archetype holding its objects goes in its log first. */
const leaveLogged = (state: State, entry: number): void => {
    const { plan } = state;
    const row = plan.row[entry];
    if (row >= 0) {
        const from = state.archetypes[plan.from[entry]];
        if (from.logs !== null) for (const log of from.logs) logSwap(log, from.id, from.count - 1, row);
    }
    leave(state, entry);
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

const merged = (carried: Reserved | null, reservations: Reserved): Reserved => {
    if (carried === null) return reservations;
    const reused = new Int32Array(carried.reused.length + reservations.reused.length);
    reused.set(carried.reused);
    reused.set(reservations.reused, carried.reused.length);
    return { reused, firstNew: Math.min(carried.firstNew, reservations.firstNew) };
};

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
    plan.dropped = 0;
    plan.more.clear();
    plan.fresh.clear();
    const { pairs } = plan;
    pairs.byKey.clear();
    pairs.from.length = pairs.to.length = pairs.count.length = pairs.start.length = 0;
    // Systems reuse their buffers next run.
    for (const { buffer } of queued) clearBuffer(buffer);
    refreshDirectories(state);
    flushDirectory(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
    // Published once the records name what its entries do, and before the epoch turns even.
    for (let k = 0; k < state.logs.length; k++) publishLog(state.logs[k]);
    endStructure(state.directory);
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
    plan.dropped = 0;
    let reservations: Reserved | null = null;
    beginStructure(state.directory);
    try {
        const made = materialize(state.memory, state.entities);
        // Positions blocks left unused name reservations of this sync point's own.
        const { unused } = state;
        let unreserved = 0;
        for (let k = 0; k < unused.length; k += 2) unreserved += unreserve(state.entities, made, unused[k], unused[k + 1]);
        unused.length = 0;
        reservations = merged(state.carried, made);
        state.carried = null;
        const tick = ++state.tick;
        for (let k = 0; k < state.logs.length; k++) beginLog(state.logs[k], tick);
        const deriving = derives(structure);
        const close = (archetype: Archetype): Archetype => closureOf(structure, state.derived, archetype, components => archetypeOf(state, components), state.archetypes);
        const born = new Map<number, number>();
        // Before the plan, so commands against staged entities find them, and before any growth, which copies `count` rows.
        if (!isolated) plan.spawned += commitBatches(state, tick, born, deriving ? close : null);
        plan.spawned += commitStaged(state, queued, tick, born, deriving ? close : null);
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
        state.syncing = { queued, reservations, reserved: state.entities.length, tick, born, index, deriving, isolated, unreserved };
        return true;
    }
    catch (error) {
        // The next sync point's leak scan frees reservations whose spawns this one dropped.
        if (reservations !== null) state.carried = reservations;
        cleanUp(state, queued);
        throw error;
    }
};

/** What a sync point whose finalizers threw nothing returns: read-only, so one is shared. */
const nothingThrown: readonly Thrown[] = [];

/**
 * The second half: runs finalizers against the plan, then applies it. A finalizer that throws doesn't stop the sync
 * point; what each threw is returned once it has applied.
 */
export const applySync = (state: State): readonly Thrown[] => {
    const syncing = state.syncing;
    if (syncing === null) return nothingThrown;
    const { queued, reservations, tick, born, index, deriving, isolated, unreserved } = syncing;
    const tableLength = syncing.reserved;
    const { plan } = state;
    let errors = nothingThrown;
    try {
        if (state.unplaced.length > 0 && !isolated) errors = state.unplaced.splice(0);
        if (state.finalizers.length > 0 && !isolated) {
            const thrown = runFinalizers(state, queued, born);
            errors = errors.length === 0 ? thrown : [...errors, ...thrown];
            // Finalizers reserve entities for their spawns; the next sync point accounts for them.
            if (reserved(state.entities)) state.carried = materialize(state.memory, state.entities);
        }
        sort(state, queued, tick);
        arrive(state, queued, tick, deriving);
        if (plan.pairs.leaving > 0) {
            if (state.claimed) for (let entry = plan.count - 1; entry >= 0; entry--) leaveLogged(state, entry);
            else for (let entry = plan.count - 1; entry >= 0; entry--) leave(state, entry);
        }
        if (index !== null) applyIndexChanges(state, index);
        // A reservation whose spawn never arrived, from a chunk that failed after reserving, would otherwise leak its index.
        // Every spawn consumes one reservation and the rest were unreserved, so only a shortfall needs the scan, which
        // skips what's released already. Finalizers' reservations came after, so they're left for the next sync point.
        if (plan.spawned + unreserved < reservations.reused.length + tableLength - reservations.firstNew) {
            const released = new Set(state.entities.released);
            const leaked = (index: number): boolean => (index >= plan.slots.length || plan.slots[index] < 0) && state.entities.archetype[index] < 0 && !released.has(index);
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
    return errors;
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
