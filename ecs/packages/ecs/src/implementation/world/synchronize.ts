// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Views } from '../../interface/registry/layout.js';
import { copyValue, ensureCapacity, stampChanged, swapRemove, writeF32, writeF32Lanes, writeF64, writeI32, writeU32, type Archetype, type Storage } from './archetype.js';
import { blockShift, chunkShift } from './kernel.js';
import { addCommand, clearBuffer, despawnCommand, despawnWhereCommand, despawnWhereHolds, endOf, referenceAt, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { readCell, writeCell } from './cells.js';
import { isDespawnMatch, matchesValue, type DespawnMatch } from './matching.js';
import { viewsOf } from '../../interface/registry/layout.js';
import { commitBatches, commitStaged } from './batches.js';
import { applyIndexChanges, cascadeReferences, indexChangesOf, linkBorn, type IndexChanges, type Written } from './cascade.js';
import { refreshDirectories } from './directories.js';
import { createArrivals, logArrival } from './arrivals.js';
import { noteEdge, noteEmptied, noteResourceLeft, reclaimEmptied } from './reclaim.js';
import { beginStructure, countChanged, endStructure, flushDirectory } from './layout-directory.js';
import { beginLog, logAppend, logMove, logSet, logSwap, publishLog, startTag, tagOf } from './move-log.js';
import { record } from './journal.js';
import { indexOf, kill, locate, materialize, recycle, release, reserved, unreserve, type Reserved } from './entities.js';
import { activate } from './activate.js';
import { refreshSyncSystemIndexes, runSyncSystems, type Thrown } from './sync-systems.js';
import { settleStops } from './stop-lists.js';
import { closureOf, derives, gainsOf } from './structure.js';
import type { Plan } from './plan.js';
import type { MoveLog } from './move-log.js';
import { archetypeOf, movesOf, sharedNumberOf, withComponents, withoutComponent, withShared, type State } from './state.js';
import { releaseValue } from './transfers.js';
import { resourcesWritten } from './resource-changes.js';
import { rowsWritten } from './rows-written.js';
import { recordPlan } from './run-changes.js';

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
    // The next of its commands in the same buffer, as a body's adds to one row are, extends its range.
    if (plan.buffer[entry] === buffer && plan.end[entry] === start && !plan.more.has(entry)) {
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
 * Releases the values a dropped add gives `transfer` components, which no component will hold: here, or on the joined
 * thread filling them, which staged them. A drained buffer's values here are tags.
 */
const releaseDropped = (state: State, buffer: CommandBuffer, command: number): void => {
    if (buffer.kinds[command] !== addCommand) return;
    const end = endOf(buffer, command);
    for (let k = buffer.starts[command]; k < end; k++) {
        const id = buffer.ids[k];
        if (!state.transfers[id]) continue;
        const log = state.remote[id];
        // A joined thread's own are staged there, released once it replays this sync point, which it's woken for.
        if (log !== undefined) {
            for (const channel of state.channels) if (channel.log === log) channel.dropped = true;
        }
        else if (buffer.bytes === null && buffer.values[k] !== state.starts[id]) releaseValue(buffer.values[k]);
    }
};

/**
 * Whether `archetype` has each component of `ids` from `start` to `middle` and none from there to `end`, and its
 * shared values pass `match`, when it isn't null.
 */
const matches = (archetype: Archetype, ids: Int32Array, start: number, middle: number, end: number, match: DespawnMatch | null): boolean => {
    const { storageById } = archetype;
    for (let k = start; k < middle; k++) if (storageById[ids[k]] === undefined) return false;
    for (let k = middle; k < end; k++) if (storageById[ids[k]] !== undefined) return false;
    return match === null || match.archetype(archetype);
};

/**
 * Component `id`'s value for a planned entry as the commands before `before` in the sync point leave it: the last value
 * one gives it, else the value in the row it leaves, else its start.
 */
const plannedValue = (state: State, queued: readonly Queued[], entry: number, id: number, before: { readonly buffer: number; readonly command: number }): unknown => {
    const { plan } = state;
    const ranges = plan.start[entry] < 0 ? [] : [plan.buffer[entry], plan.start[entry], plan.end[entry]];
    const more = plan.more.get(entry);
    if (more !== undefined) ranges.push(...more);
    let givenBy: CommandBuffer | null = null;
    let givenAt = -1;
    for (let r = 0; r < ranges.length; r += 3) {
        const b = ranges[r];
        if (b > before.buffer) continue;
        const { buffer } = queued[b];
        const limit = b === before.buffer ? Math.min(ranges[r + 2], buffer.starts[before.command]) : ranges[r + 2];
        for (let k = ranges[r + 1]; k < limit; k++) {
            if (buffer.ids[k] !== id) continue;
            givenBy = buffer;
            givenAt = k;
        }
    }
    if (givenBy !== null) {
        const storage = state.archetypes[plan.to[entry]]?.storageById[id];
        // A worker's struct arrives as bytes, in its storage's layout.
        if (givenBy.bytes !== null && givenBy.offsets[givenAt] >= 0 && storage !== undefined && storage.layout.kind === "linear") {
            const { stride } = storage.layout;
            const scratch = viewsOf(new ArrayBuffer(stride), 0, stride);
            scratch.u8.set(givenBy.bytes.u8.subarray(givenBy.offsets[givenAt], givenBy.offsets[givenAt] + stride));
            return storage.layout.read(scratch, 0);
        }
        return givenBy.values[givenAt];
    }
    const from = plan.from[entry] < 0 ? undefined : state.archetypes[plan.from[entry]].storageById[id];
    return from === undefined ? state.starts[id] : readCell(from, state.entities.row[indexOf(plan.entity[entry])]);
};

/** Whether a planned entry's values as the commands before `before` leave them pass `match`'s row tests. */
const plannedMatches = (state: State, queued: readonly Queued[], entry: number, match: DespawnMatch, before: { readonly buffer: number; readonly command: number }): boolean => {
    if (match.rows === null) return true;
    for (const [id, matching] of match.values) {
        if (state.shared[id] !== undefined) continue;
        if (!matchesValue(plannedValue(state, queued, entry, id, before), matching)) return false;
    }
    return true;
};

/**
 * Whether a sync point may despawn whole archetypes without an entry for each entity: when nothing that reads each
 * despawn, its entity or its row, is kept, so releasing each entity and emptying the archetype says all there is.
 */
const clearsWhole = (state: State): boolean =>
    state.syncSystems.length === 0 && state.recording === null && state.structure.referenceIds.length === 0 && state.journal.readers === 0
    && !state.claimed && !state.arrivals && state.touched === null && !state.counting && !state.transferring && state.holds.size === 0 && state.logs.length === 0;

/** Whether an archetype can be emptied whole: none of its rows planned or spawned here, and nothing per row to let go. */
const clearable = (state: State, archetype: Archetype, born: ReadonlyMap<number, number>): boolean => {
    if (archetype.resource || archetype.strings.length !== 0 || archetype.logs !== null || born.has(archetype.id)) return false;
    const { slots } = state.plan;
    const { entities } = archetype;
    for (let row = 0; row < archetype.count; row++) if (slots[indexOf(entities[row])] >= 0) return false;
    return true;
};

/** Copies `count` rows of `from`'s cells from `fromStart` to `to`'s from `toStart`, values and ticks, each column as one block. */
const copyRows = (from: Storage, to: Storage, fromStart: number, count: number, toStart: number): void => {
    const { words } = from;
    if (words > 0) to.views.u32.set(from.views.u32.subarray(fromStart * words, (fromStart + count) * words), toStart * words);
    else if (from.layout.kind !== "constant") for (let k = 0; k < count; k++) copyValue(from, fromStart + k, to, toStart + k);
    if (!to.ticked) return;
    to.added.set(from.added.subarray(fromStart, fromStart + count), toStart);
    to.changed.set(from.changed.subarray(fromStart, fromStart + count), toStart);
    // A block's and a chunk's tick are the newest of their rows, so rows moving in can raise them.
    for (let k = 0; k < count; k++) {
        const added = from.added[fromStart + k];
        const changed = from.changed[fromStart + k];
        const target = toStart + k;
        if (added > to.blockAdded[target >> blockShift]) to.blockAdded[target >> blockShift] = added;
        if (changed > to.blockChanged[target >> blockShift]) to.blockChanged[target >> blockShift] = changed;
        if (added > to.chunkAdded[target >> chunkShift]) to.chunkAdded[target >> chunkShift] = added;
        if (changed > to.chunkChanged[target >> chunkShift]) to.chunkChanged[target >> chunkShift] = changed;
    }
};

/** Repeats the first `words` words from `start` until `count` copies fill the range, doubling what each copy takes. */
const replicate = (words: Uint32Array, start: number, width: number, count: number): void => {
    const total = width * count;
    for (let filled = width; filled < total;) {
        const next = Math.min(filled, total - filled);
        words.copyWithin(start + filled, start, start + next);
        filled += next;
    }
};

/** Stamps `tick` on rows `start` to `start + count`, and their blocks and chunks, of tick columns. */
const stampRange = (ticks: Float64Array, blocks: Float64Array, chunks: Float64Array, start: number, count: number, tick: number): void => {
    ticks.fill(tick, start, start + count);
    blocks.fill(tick, start >> blockShift, ((start + count - 1) >> blockShift) + 1);
    chunks.fill(tick, start >> chunkShift, ((start + count - 1) >> chunkShift) + 1);
};

/**
 * Writes the values of a block's `count` adds from `command` into rows from `toStart`: a component every add gives the
 * same value is written once and its words repeated, as an add of a constant gives; any other row by row.
 */
const writeBlockValues = (buffer: CommandBuffer, command: number, count: number, to: Archetype, toStart: number, from: Archetype, tick: number): void => {
    const first = buffer.starts[command];
    const width = endOf(buffer, command) - first;
    for (let i = 0; i < width; i++) {
        const id = buffer.ids[first + i];
        const storage = to.storageById[id];
        if (storage === undefined) continue;
        const value = buffer.values[first + i];
        const { words } = storage;
        const { bytes, offsets } = buffer;
        // A worker's structs arrive as bytes: alike when every add's words are the first's.
        const offset = bytes === null ? -1 : offsets[first + i];
        let same = words > 0 && storage.remote === null && storage.layout.kind === "linear" && (bytes === null || (offset >= 0 && (offset & 3) === 0));
        if (bytes === null) for (let k = 1; k < count && same; k++) same = buffer.values[buffer.starts[command + k] + i] === value;
        else {
            const source = bytes.u32;
            const base = offset >> 2;
            for (let k = 1; k < count && same; k++) {
                const other = offsets[buffer.starts[command + k] + i];
                if (other < 0 || (other & 3) !== 0) same = false;
                else for (let w = 0; w < words && same; w++) same = source[(other >> 2) + w] === source[base + w];
            }
        }
        if (!same) {
            for (let k = 0; k < count; k++) {
                const at = buffer.starts[command + k] + i;
                writeRange(buffer, at, at + 1, to, toStart + k, from, undefined, tick);
            }
            continue;
        }
        if (bytes === null) writeCell(storage, toStart, value);
        else copyBytes(storage, toStart, bytes, offset);
        replicate(storage.views.u32, toStart * words, words, count);
        if (!storage.ticked) continue;
        const starts = from.storageById[id] === undefined;
        // A constant's `changed` ticks are its `added` ticks, and its value can't change: only a new start stamps it.
        if (storage.changed !== storage.added || starts) stampRange(storage.changed, storage.blockChanged, storage.chunkChanged, toStart, count, tick);
        if (starts) stampRange(storage.added, storage.blockAdded, storage.chunkAdded, toStart, count, tick);
    }
};

/** Lets go of the objects rows 0 to `count` of an archetype hold, which leave it. */
const releaseObjects = (archetype: Archetype, count: number): void => {
    if (archetype.objects) for (const storage of archetype.storages) if (storage.layout.kind === "object" && storage.remote === null) storage.values.fill(undefined, 0, count);
};

/**
 * Applies the blocks, which name archetypes' every row: an archetype's entities despawned, each released, or moved to
 * its target as one block of rows after the target's, in their order, its shared cells copied a column at a time, then
 * each command's values written and each entity placed. Each archetype is left empty, before entries arrive in it.
 */
const applyBlocks = (state: State, queued: readonly Queued[], tick: number): void => {
    const { plan, entities, archetypes } = state;
    /** By archetype emptied, the row its rows start at in their target, which has made room for them; -1 for a despawn. */
    const starts = new Map<number, number>();
    for (const block of plan.blocks) {
        if (block.void) continue;
        const from = archetypes[block.from];
        if (!starts.has(block.from)) {
            if (block.kind === despawnCommand) starts.set(block.from, -1);
            else {
                const to = archetypes[block.to];
                ensureCapacity(state.memory, to, to.count + from.count);
                starts.set(block.from, to.count);
                to.count += from.count;
            }
        }
        const { row, count } = block;
        if (block.kind === despawnCommand) {
            for (let k = 0; k < count; k++) release(entities, indexOf(from.entities[row + k]));
            continue;
        }
        const to = archetypes[block.to];
        const toStart = (starts.get(block.from) ?? 0) + row;
        to.entities.set(from.entities.subarray(row, row + count), toStart);
        const moves = movesOf(from, to);
        for (let m = 0; m < moves.length; m += 2) copyRows(moves[m], moves[m + 1], row, count, toStart);
        const { buffer } = queued[block.buffer];
        if (block.kind === addCommand) {
            state.valuesWritten = tick;
            writeBlockValues(buffer, block.command, count, to, toStart, from, tick);
        }
        for (let k = 0; k < count; k++) {
            const index = indexOf(from.entities[row + k]);
            entities.archetype[index] = to.id;
            entities.row[index] = toStart + k;
        }
    }
    for (const id of starts.keys()) {
        const from = archetypes[id];
        releaseObjects(from, from.count);
        from.count = 0;
    }
};

/** Empties the archetypes `despawnWhere`s cleared: each entity released, each row's objects let go, no row moved. */
const clearArchetypes = (state: State): void => {
    const { plan, entities } = state;
    for (const id of plan.cleared) {
        const archetype = state.archetypes[id];
        const count = archetype.count;
        for (let row = 0; row < count; row++) release(entities, indexOf(archetype.entities[row]));
        if (archetype.objects) for (const storage of archetype.storages) if (storage.layout.kind === "object" && storage.remote === null) storage.values.fill(undefined, 0, count);
        archetype.count = 0;
    }
};

/** The archetype an entity planned into `archetype` ends up in once derived. */
const closedOf = (state: State, archetype: Archetype): Archetype => {
    const cached = state.structure.closures[archetype.id] ?? -1;
    return cached >= 0 ? state.archetypes[cached] : closureOf(state.structure, state.derived, archetype, (components, shared) => archetypeOf(state, components, shared), state.archetypes);
};

/**
 * Despawns each entity alive before the sync point that a `despawnWhere` command selects given the plan so far: those
 * planned, by where they're going and the values the commands before it give them, then the rest, by the archetype
 * they're in and their rows' values. Never the resource entity, nor an entity the sync point spawns: `born` holds the
 * first row each archetype gained at it. An archetype every row of which it selects is emptied whole, where the sync
 * point allows it, without an entry for each.
 */
const despawnWhere = (state: State, queued: readonly Queued[], b: number, command: number, within: boolean, born: ReadonlyMap<number, number>): void => {
    const { plan, archetypes } = state;
    const { buffer } = queued[b];
    const { ids } = buffer;
    const start = buffer.starts[command];
    const middle = start + buffer.entities[command];
    const last = endOf(buffer, command);
    const given = ids[last - 1] === despawnWhereHolds ? buffer.values[last - 1] : null;
    const match = isDespawnMatch(given) ? given : null;
    const end = match === null ? last : last - 1;
    const before = { buffer: b, command };
    const { row } = state.entities;
    for (let entry = 0; entry < plan.count; entry++) {
        const from = plan.from[entry];
        if (plan.despawned[entry] === 1 || plan.entity[entry] === state.resourceEntity || from < 0) continue;
        const first = born.get(from);
        if (first !== undefined && row[indexOf(plan.entity[entry])] >= first) continue;
        const to = archetypes[plan.to[entry]];
        if (!matches(within && plan.to[entry] !== plan.from[entry] ? closedOf(state, to) : to, ids, start, middle, end, match)) continue;
        if (match === null || plannedMatches(state, queued, entry, match, before)) plan.despawned[entry] = 1;
    }
    const { slots } = plan;
    const count = archetypes.length;
    const whole = clearsWhole(state);
    if (plan.clearing.length < count) {
        const grown = new Uint8Array(Math.max(count, plan.clearing.length * 2));
        grown.set(plan.clearing);
        plan.clearing = grown;
    }
    for (let id = 0; id < count; id++) {
        const archetype = archetypes[id];
        if (archetype.resource || archetype.count === 0 || plan.clearing[id] === 1 || !matches(archetype, ids, start, middle, end, match)) continue;
        const test = match?.rows?.(archetype) ?? null;
        if (test === null && whole && clearable(state, archetype, born)) {
            plan.clearing[id] = 1;
            plan.cleared.push(id);
            continue;
        }
        ensurePlanCapacity(state, plan.count + archetype.count);
        const { entities } = archetype;
        const alive = born.get(id) ?? archetype.count;
        for (let at = 0; at < alive; at++) {
            const entity = entities[at];
            const index = indexOf(entity);
            if (slots[index] < 0 && (test === null || test(at))) plan.despawned[addPlanned(state, entity, index, id, id)] = 1;
        }
    }
};

/** What planning a sync point's commands keeps across them. */
type Planning = { readonly within: boolean; readonly references: boolean; readonly empty: number; readonly written: Written; readonly born: ReadonlyMap<number, number> };

/** Plans one command, in issue order: the net change for its entity. Commands against dead entities do nothing. */
const planCommand = (state: State, queued: readonly Queued[], b: number, command: number, planning: Planning): void => {
    const { plan, structure, archetypes } = state;
    const { slots } = plan;
    const { buffer, guarded } = queued[b];
    const { kinds, entities, starts, ids } = buffer;
    const { within, references, empty, written, born } = planning;
    const kind = kinds[command];
    if (kind === despawnWhereCommand) {
        despawnWhere(state, queued, b, command, within, born);
        ensurePlanCapacity(state, plan.count + buffer.count - command);
        return;
    }
    const entity = entities[command];
    if (guarded && entity === state.resourceEntity) return;
    const index = indexOf(entity);
    let entry: number;
    // Only the world spawns through a command, its resource entity: systems' and kernels' spawns are staged.
    if (kind === spawnCommand) {
        entry = addPlanned(state, entity, index, -1, empty);
        plan.spawned++;
        const start = starts[command];
        const end = endOf(buffer, command);
        let to = withComponents(state, archetypes[empty], ids, start, end);
        for (let k = start; k < end; k++) if (state.shared[ids[k]] !== undefined) to = withShared(state, to, ids[k], sharedNumberOf(state, ids[k], buffer.values[k]));
        plan.to[entry] = to.id;
        if (end > start) addRange(state, entry, b, start, end);
        if (references) for (let k = start; k < end; k++) if (structure.references[ids[k]] !== 0) written.push(entity, ids[k], referenceAt(buffer, k));
        return;
    }
    else {
        entry = slots[index];
        if (entry >= 0) {
            if (plan.entity[entry] !== entity || plan.despawned[entry] === 1) {
                plan.dropped++;
                if (state.transferring) releaseDropped(state, buffer, command);
                return;
            }
        }
        else {
            if (locate(state.entities, entity) < 0 || (plan.cleared.length > 0 && plan.clearing[state.entities.archetype[index]] === 1)) {
                plan.dropped++;
                if (state.transferring) releaseDropped(state, buffer, command);
                return;
            }
            const from = state.entities.archetype[index];
            entry = addPlanned(state, entity, index, from, from);
        }
    }
    if (kind === despawnCommand) {
        plan.despawned[entry] = 1;
        return;
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
            return;
        }
        const source = to.id;
        for (let k = start; k < end; k++) {
            to = withoutComponent(state, to, ids[k]);
            if (within) to = withoutDependents(state, to, ids[k]);
        }
        if (shape !== null) {
            shape.removing[source] = to.id;
            noteEdge(shape.removing, source, undefined, archetypes[source], to);
        }
        plan.to[entry] = to.id;
        return;
    }
    const from = plan.from[entry] < 0 ? null : archetypes[plan.from[entry]];
    // A list naming a shared component goes where its values say, so its target isn't kept by source.
    const keeps = shape !== null && shape.shared.length === 0;
    const known = keeps ? shape.adding[to.id] : undefined;
    const source = to.id;
    const planned = to;
    for (let k = start; k < end; k++) {
        const id = ids[k];
        // Removed earlier in this sync point and added again: a new start, so a new `added` tick.
        if (from !== null && from !== planned && planned.storageById[id] === undefined && from.storageById[id] !== undefined) {
            let fresh = plan.fresh.get(entry);
            if (fresh === undefined) plan.fresh.set(entry, fresh = []);
            if (!fresh.includes(id)) fresh.push(id);
        }
        if (references && structure.references[id] !== 0) written.push(entity, id, referenceAt(buffer, k));
    }
    if (known !== undefined) to = archetypes[known];
    else {
        to = withComponents(state, to, ids, start, end);
        for (let k = start; k < end; k++) if (state.shared[ids[k]] !== undefined) to = withShared(state, to, ids[k], sharedNumberOf(state, ids[k], buffer.values[k]));
        if (keeps) {
            shape.adding[source] = to.id;
            noteEdge(shape.adding, source, undefined, archetypes[source], to);
        }
    }
    plan.to[entry] = to.id;
    if (end > start) addRange(state, entry, b, start, end);
};

/** A block's code in `plan.slots`, below -1, from its index in `plan.blocks`. */
const blockCode = (block: number): number => -2 - block;

/**
 * Plans a block's commands as entries after all, as a later command naming one of its entities or a `despawnWhere`
 * needs: they come before anything planned after them that names its entities, so planning them late plans the same.
 */
const unblock = (state: State, queued: readonly Queued[], block: number, planning: Planning): void => {
    const { plan } = state;
    const found = plan.blocks[block];
    if (found.void) return;
    found.void = true;
    const { entities } = queued[found.buffer].buffer;
    for (let k = 0; k < found.count; k++) plan.slots[indexOf(entities[found.command + k])] = -1;
    ensurePlanCapacity(state, plan.count + found.count);
    for (let k = 0; k < found.count; k++) planCommand(state, queued, found.buffer, found.command + k, planning);
};

/** Plans every block's commands as entries. */
const unblockAll = (state: State, queued: readonly Queued[], planning: Planning): void => {
    for (let block = 0; block < state.plan.blocks.length; block++) unblock(state, queued, block, planning);
};

/** The fewest commands kept as a block: below it, entries cost no more. */
const blockMinimum = 16;

/**
 * Keeps the commands from `command` on as a block when they name rows of the first one's archetype in row order, as a
 * row system's or a worker's share of one does, each the same `remove`, `add` or `despawn` of the same components, none
 * shared, none of their entities planned and no row spawned at this sync point; returns how many it kept, 0 for none.
 * Once every command is planned, an archetype's blocks are kept only if together they name all its rows.
 */
const blockAt = (state: State, queued: readonly Queued[], b: number, command: number, born: ReadonlyMap<number, number>): number => {
    const { plan, archetypes } = state;
    const { buffer, guarded } = queued[b];
    const { kinds, entities, starts, ids } = buffer;
    const kind = kinds[command];
    if (kind !== removeCommand && kind !== addCommand && kind !== despawnCommand) return 0;
    if (buffer.count - command < blockMinimum) return 0;
    const entity = entities[command];
    const index = indexOf(entity);
    if (index >= state.entities.length) return 0;
    const fromId = state.entities.archetype[index];
    if (fromId < 0) return 0;
    const from = archetypes[fromId];
    const row = state.entities.row[index];
    if (from.entities[row] !== entity || from.count - row < blockMinimum || from.resource || from.strings.length !== 0 || from.logs !== null || born.has(fromId) || plan.clearing[fromId] === 1) return 0;
    if (guarded && entity === state.resourceEntity) return 0;
    const first = starts[command];
    const width = endOf(buffer, command) - first;
    for (let k = first; k < first + width; k++) if (state.shared[ids[k]] !== undefined) return 0;
    let to = -1;
    if (kind !== despawnCommand) {
        let target = from;
        if (kind === addCommand) target = withComponents(state, from, ids, first, first + width);
        else for (let k = first; k < first + width; k++) target = withoutComponent(state, target, ids[k]);
        // Commands that leave the archetype as it is only replace values: entries write them in place.
        if (target === from) return 0;
        to = target.id;
    }
    const { slots } = plan;
    const limit = Math.min(buffer.count - command, from.count - row);
    const fromEntities = from.entities;
    const code = blockCode(plan.blocks.length);
    const id = ids[first];
    // Checks and marks each command's entity in one pass; a run too short to keep is unmarked.
    let count = 0;
    for (; count < limit; count++) {
        const at = command + count;
        const named = entities[at];
        const slot = indexOf(named);
        if (kinds[at] !== kind || named !== fromEntities[row + count] || slots[slot] !== -1) break;
        const start = starts[at];
        const end = at + 1 < buffer.count ? starts[at + 1] : buffer.named;
        if (end - start !== width) break;
        if (width === 1) {
            if (ids[start] !== id) break;
        }
        else {
            let same = true;
            for (let i = 0; i < width && same; i++) same = ids[start + i] === ids[first + i];
            if (!same) break;
        }
        slots[slot] = code;
    }
    if (count < blockMinimum) {
        for (let k = 0; k < count; k++) slots[indexOf(entities[command + k])] = -1;
        return 0;
    }
    plan.blocks.push({ from: fromId, to, row, buffer: b, command, count, kind, void: false });
    return count;
};

/**
 * Plans as entries the blocks of each archetype they don't name every row of together, each the same change, so the
 * blocks left move or despawn archetypes whole.
 */
const settleBlocks = (state: State, queued: readonly Queued[], planning: Planning): void => {
    const { plan } = state;
    const byArchetype = new Map<number, number[]>();
    plan.blocks.forEach((block, index) => {
        if (block.void) return;
        const list = byArchetype.get(block.from);
        if (list === undefined) byArchetype.set(block.from, [index]);
        else list.push(index);
    });
    for (const [id, indexes] of byArchetype) {
        const listed = indexes.map(index => plan.blocks[index]).sort((a, c) => a.row - c.row);
        let next = 0;
        let whole = true;
        for (const block of listed) {
            if (block.row !== next || block.kind !== listed[0].kind || block.to !== listed[0].to) whole = false;
            next = block.row + block.count;
        }
        if (whole && next === state.archetypes[id].count) continue;
        for (const index of indexes) unblock(state, queued, index, planning);
        byArchetype.delete(id);
    }
    // An archetype blocks empty takes no block's rows, which emptying it would lose.
    for (const indexes of byArchetype.values()) {
        if (!byArchetype.has(plan.blocks[indexes[0]].to)) continue;
        for (const index of indexes) unblock(state, queued, index, planning);
    }
};

/**
 * Whether a sync point keeps commands naming a whole archetype as blocks: where it keeps nothing reading each change, as
 * `despawnWhere` emptying archetypes needs, and derives nothing, whose closures entries take.
 */
const blocks = (state: State): boolean => clearsWhole(state) && !derives(state.structure) && !state.structure.rederive;

/**
 * Plan: the net change for each entity, in issue order. Commands against dead entities do nothing. Reference values
 * written by commands go to `written`, to check once despawns are known.
 */
const planOf = (state: State, queued: readonly Queued[], written: Written, born: ReadonlyMap<number, number>): void => {
    const { plan, structure } = state;
    if (plan.slots.length < state.entities.length) plan.slots = new Int32Array(Math.max(state.entities.length, plan.slots.length * 2)).fill(-1);
    if (plan.clearing.length < state.archetypes.length) {
        const grown = new Uint8Array(Math.max(state.archetypes.length, plan.clearing.length * 2));
        grown.set(plan.clearing);
        plan.clearing = grown;
    }
    const planning: Planning = { within: derives(structure), references: structure.referenceIds.length > 0, empty: archetypeOf(state, []).id, written, born };
    const blocking = blocks(state);
    for (let b = 0; b < queued.length; b++) {
        const { buffer } = queued[b];
        const { kinds, entities } = buffer;
        // Each command adds at most one entry.
        ensurePlanCapacity(state, plan.count + buffer.count);
        for (let command = 0; command < buffer.count; command++) {
            const kind = kinds[command];
            if (kind === despawnWhereCommand) unblockAll(state, queued, planning);
            else if (plan.blocks.length > 0 && kind !== spawnCommand) {
                const slot = plan.slots[indexOf(entities[command])];
                if (slot < -1) unblock(state, queued, -2 - slot, planning);
            }
            if (blocking && kind !== despawnWhereCommand) {
                const kept = blockAt(state, queued, b, command, born);
                if (kept > 0) {
                    command += kept - 1;
                    continue;
                }
            }
            planCommand(state, queued, b, command, planning);
        }
    }
    if (plan.blocks.length > 0) settleBlocks(state, queued, planning);
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
            storage.blockChanged[toRow >> blockShift] = tick;
            storage.chunkChanged[toRow >> chunkShift] = tick;
        }
        if (starts) {
            storage.added[toRow] = tick;
            storage.blockAdded[toRow >> blockShift] = tick;
            storage.chunkAdded[toRow >> chunkShift] = tick;
        }
    }
};

/** Writes a derived component's default into a row it starts in, stamped as added. */
export const writeDefault = (state: State, storage: Storage, row: number, tick: number): void => {
    // A joined thread's object starts there, as the row's move or append says.
    // One start per world, never one per row: values are replaced whole, so a shared start is never changed.
    if (storage.remote === null) writeCell(storage, row, state.starts[storage.component]);
    else storage.tags[row] = startTag;
    if (!storage.ticked) return;
    storage.added[row] = storage.changed[row] = tick;
    storage.blockAdded[row >> blockShift] = storage.blockChanged[row >> blockShift] = tick;
    storage.chunkAdded[row >> chunkShift] = storage.chunkChanged[row >> chunkShift] = tick;
};

/** Writes the values an entry's commands give into its row, in issue order. */
const writeValues = (state: State, queued: readonly Queued[], entry: number, to: Archetype, toRow: number, from: Archetype | null, tick: number): void => {
    const { plan } = state;
    if (plan.start[entry] < 0) return;
    state.valuesWritten = tick;
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
    if (state.plan.cleared.length > 0) clearArchetypes(state);
    if (state.plan.blocks.length > 0) applyBlocks(state, queued, tick);
    const { entities, archetypes, plan } = state;
    const { pairs } = plan;
    const width = archetypes.length + 1;
    let lastKey = -1;
    let lastPair = -1;
    /** The last entry that joined a pair, to tell whether each pair's entries are consecutive. */
    let lastJoined = -2;
    let ranges = true;
    let leaving = 0;
    /** Indexes a joined thread's sync systems hold, which a despawn kills without releasing; null for none. */
    const holds = state.holds.size > 0 ? state.holds.counts : null;
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
            if (fromId >= 0 && state.counting) countChanged(state.counted, archetypes[fromId]);
            // Held while a joined thread's sync systems haven't acknowledged its stop.
            if (holds !== null && index < holds.length && holds[index] > 0) kill(entities, index);
            else release(entities, index);
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
            pair = pairs.length++;
            pairs.byKey.set(key, pair);
            pairs.from[pair] = fromId;
            pairs.to[pair] = toId;
            pairs.count[pair] = 0;
            pairs.start[pair] = entry;
        }
        else if (pair !== lastPair || entry !== lastJoined + 1) ranges = false;
        lastKey = key;
        lastPair = pair;
        lastJoined = entry;
        plan.pair[entry] = pair;
        pairs.count[pair]++;
    }
    pairs.leaving = leaving;
    // Each archetype grows once to fit the entities moving or spawning into it, from its pairs' counts.
    if (plan.incoming.length < archetypes.length) plan.incoming = new Int32Array(Math.max(archetypes.length, plan.incoming.length * 2));
    const { incoming } = plan;
    for (let pair = 0; pair < pairs.length; pair++) incoming[pairs.to[pair]] += pairs.count[pair];
    for (let pair = 0; pair < pairs.length; pair++) {
        const id = pairs.to[pair];
        if (incoming[id] === 0) continue;
        const archetype = archetypes[id];
        ensureCapacity(state.memory, archetype, archetype.count + incoming[id]);
        incoming[id] = 0;
    }
    if (pairs.order.length < plan.count) pairs.order = new Int32Array(Math.max(plan.count, pairs.order.length * 2));
    const { order } = pairs;
    // Each pair's block is its own range of entries.
    if (ranges) {
        for (let entry = 0; entry < plan.count; entry++) order[entry] = entry;
        return;
    }
    let start = 0;
    for (let pair = 0; pair < pairs.length; pair++) {
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
        // Runs of rows next to each other, as a whole archetype moving gives, copy as one block.
        for (let k = 0; k < count;) {
            const row = plan.row[order[first + k]];
            let run = 1;
            while (k + run < count && plan.row[order[first + k + run]] === row + run) run++;
            if (run === 1) {
                const s = row * words;
                const t = (toStart + k) * words;
                for (let i = 0; i < words; i++) target[t + i] = source[s + i];
            }
            else target.set(source.subarray(row * words, (row + run) * words), (toStart + k) * words);
            k += run;
        }
    }
    else if (from.layout.kind !== "constant") {
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
        // A block's and a chunk's tick are the newest of their rows, so a row moving in can raise them.
        const block = toRow >> blockShift;
        if (added > to.blockAdded[block]) to.blockAdded[block] = added;
        if (changed > to.blockChanged[block]) to.blockChanged[block] = changed;
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
    for (let pair = 0; pair < pairs.length; pair++) {
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
            // Systems with `where` and change filters read it, a joined thread's included.
            if (state.arrivals || state.claimed) logArrival(state.arrivalRing ??= createArrivals(state.memory), from.id, to.id, tick);
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
    if (from.strings.length !== 0) releaseStrings(state, from, row, plan.despawned[entry] === 1 ? null : state.archetypes[plan.to[entry]]);
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

/** Lets go of the strings' records a row leaving `from` holds that its entity doesn't take to `to`, null for a despawn. */
const releaseStrings = (state: State, from: Archetype, row: number, to: Archetype | null): void => {
    const { strings } = state;
    if (strings === null || !strings.active) return;
    const held = from.strings;
    for (let s = 0; s < held.length; s++) {
        const storage = held[s];
        if (to === null || to.storageById[storage.component] === undefined) strings.retire(storage.views.u32[row]);
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

const merged = (carried: Reserved | null, reservations: Reserved): Reserved => {
    if (carried === null) return reservations;
    const reused = new Int32Array(carried.reused.length + reservations.reused.length);
    reused.set(carried.reused);
    reused.set(reservations.reused, carried.reused.length);
    return { reused, firstNew: Math.min(carried.firstNew, reservations.firstNew) };
};

/** Every live entity whose archetype's closure differs gets an entry, after derivations were registered. */
const rederive = (state: State): void => {
    const { structure, archetypes } = state;
    structure.rederive = false;
    for (const archetype of [...archetypes]) {
        if (archetype.resource || archetype.count === 0) continue;
        const closed = closureOf(structure, state.derived, archetype, (components, shared) => archetypeOf(state, components, shared), archetypes);
        if (closed === archetype) continue;
        for (let row = 0; row < archetype.count; row++) {
            const entity = archetype.entities[row];
            if (state.plan.slots[indexOf(entity)] < 0) addEntry(state, entity, indexOf(entity), archetype.id, archetype.id);
        }
    }
};

/** The queued buffers, leaving the spare list, empty, to queue the next sync point's; they're the spare from now on. */
const takeQueued = (state: State): Queued[] => {
    const queued = state.queued;
    state.queued = state.spareQueued;
    state.spareQueued = queued;
    return queued;
};

/** Undoes a planned sync point's shared state, after it applied or failed. */
const cleanUp = (state: State, queued: readonly Queued[]): void => {
    const { plan } = state;
    // The plan's arrays are reused by the next sync point, so they're always left clean, even after a throw.
    for (let entry = 0; entry < plan.count; entry++) plan.slots[indexOf(plan.entity[entry])] = -1;
    plan.count = 0;
    plan.spawned = 0;
    plan.dropped = 0;
    // A map's `clear` allocates its table again, so only one holding something is cleared.
    if (plan.more.size > 0) plan.more.clear();
    if (plan.fresh.size > 0) plan.fresh.clear();
    if (plan.born.size > 0) plan.born.clear();
    for (const id of plan.cleared) plan.clearing[id] = 0;
    plan.cleared.length = 0;
    for (const block of plan.blocks) {
        if (block.void) continue;
        const { entities } = queued[block.buffer].buffer;
        for (let k = 0; k < block.count; k++) plan.slots[indexOf(entities[block.command + k])] = -1;
    }
    plan.blocks.length = 0;
    const { pairs } = plan;
    if (pairs.byKey.size > 0) pairs.byKey.clear();
    // Their arrays keep their elements: emptying one lets its storage go, which the next sync point's pairs allocate again.
    pairs.length = 0;
    // Systems reuse their buffers next run.
    for (const { buffer } of queued) clearBuffer(buffer);
    if (queued === state.spareQueued) state.spareQueued.length = 0;
    refreshDirectories(state);
    flushDirectory(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
    // Published once the records name what its entries do, and before the epoch turns even.
    for (let k = 0; k < state.logs.length; k++) publishLog(state.logs[k]);
    endStructure(state.directory);
    state.syncing = null;
    // Threads whose sync systems have new stops run them now, whether or not a task or observer post would replay them,
    // as do threads with staged values to release.
    for (let k = 0; k < state.channels.length; k++) {
        const channel = state.channels[k];
        if (!channel.stops.unwoken && !channel.dropped) continue;
        channel.stops.unwoken = false;
        channel.dropped = false;
        channel.wake();
    }
};

/** Whether any queued buffer holds commands. */
const anyCommands = (queued: readonly Queued[]): boolean => {
    for (let k = 0; k < queued.length; k++) if (queued[k].buffer.count !== 0) return true;
    return false;
};

/** Whether some archetype with rows, other than the resource entity's, has what `despawnWhere` command `command` selects. */
const selectsAny = (state: State, buffer: CommandBuffer, command: number): boolean => {
    const { ids, values } = buffer;
    const start = buffer.starts[command];
    const middle = start + buffer.entities[command];
    const last = endOf(buffer, command);
    const given = ids[last - 1] === despawnWhereHolds ? values[last - 1] : null;
    const match = isDespawnMatch(given) ? given : null;
    const end = match === null ? last : last - 1;
    const { archetypes } = state;
    for (let id = 0; id < archetypes.length; id++) {
        const archetype = archetypes[id];
        if (!archetype.resource && archetype.count !== 0 && matches(archetype, ids, start, middle, end, match)) return true;
    }
    return false;
};

/**
 * Drops the queued commands when they're all `despawnWhere`s that select nothing, so the sync point taking them can be
 * idle. Sound only for the whole queue at once: with no other command queued, nothing moves an entity into what one
 * selects before it applies, and what the sync point spawns, it never selects. Returns whether the queue is empty.
 */
export const dropUnselecting = (state: State): boolean => {
    const { queued } = state;
    for (let k = 0; k < queued.length; k++) {
        const { buffer } = queued[k];
        if (buffer.stagedCount !== 0) return false;
        for (let command = 0; command < buffer.count; command++) {
            if (buffer.kinds[command] !== despawnWhereCommand || selectsAny(state, buffer, command)) return false;
        }
    }
    for (let k = 0; k < queued.length; k++) clearBuffer(queued[k].buffer);
    queued.length = 0;
    return true;
};

/** The queue a sync point takes while nothing is queued, shared, since none is written to. */
const noneQueued: readonly Queued[] = [];

/** Whether a sync point would apply anything: commands queued, entities reserved or carried, derivations to derive again, or failures to give. */
export const syncPending = (state: State, queued: readonly Queued[] = state.queued): boolean =>
    anyCommands(queued) || reserved(state.entities) || state.carried !== null || state.structure.rederive
    // Failures for its run, as a gone thread's stops it never ran are.
    || state.unplaced.length > 0
    // A watched resource written, which its changes systems see at a sync point.
    || (state.resourcesSeen.size > 0 && resourcesWritten(state))
    // A watched component written through a row.
    || (state.rowsWatched.length > 0 && rowsWritten(state));

/**
 * The first half of a sync point: commits batch spawns, plans every command, cascades references and closes the plan
 * under derivations. Nothing that exists moves yet, so the GPU can read back what the plan disturbs before `applySync`.
 * Returns false when there's nothing to apply. An `isolated` one applies only the queued buffers, without batches,
 * re-deriving or sync systems, for registration's own changes between runs.
 */
export const prepareSync = (state: State, isolated = false): boolean => {
    if (!isolated) activate(state);
    if (state.queued.length !== 0) dropUnselecting(state);
    // Taken first, so a sync point that throws can't replay its commands into the next one.
    const queued = state.queued.length === 0 ? noneQueued : takeQueued(state);
    // Sync systems' spawns are reserved during the last sync point, so their batches are pending without a reservation.
    if (!syncPending(state, queued)) {
        if (queued === state.spareQueued) state.spareQueued.length = 0;
        return false;
    }
    preparePending(state, queued, isolated);
    return true;
};

/**
 * `prepareSync` once something is pending: apart, so a sync point with nothing to apply allocates none of the context
 * its closures share.
 */
const preparePending = (state: State, queued: readonly Queued[], isolated: boolean): void => {
    const { structure, plan } = state;
    // Sync systems see indexes as of before the sync point applies, with nothing it spawns or moves.
    if (!isolated) refreshSyncSystemIndexes(state);
    plan.count = 0;
    plan.spawned = 0;
    plan.dropped = 0;
    let reservations: Reserved | null = null;
    beginStructure(state.directory);
    try {
        // Indexes whose stops joined threads ran are released, reusable after this sync point.
        if (state.claimed) for (let k = 0; k < state.channels.length; k++) settleStops(state.channels[k].stops, state.holds, state.entities.released);
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
        const close = (archetype: Archetype): Archetype => closureOf(structure, state.derived, archetype, (components, shared) => archetypeOf(state, components, shared), state.archetypes);
        const { born } = plan;
        // Before the plan, so commands against staged entities find them, and before any growth, which copies `count`
        // rows.
        if (!isolated) plan.spawned += commitBatches(state, tick, born, deriving ? close : null);
        plan.spawned += commitStaged(state, queued, tick, born, deriving ? close : null);
        const written: Written = [];
        planOf(state, queued, written, born);
        if (structure.rederive && !isolated) rederive(state);
        if (deriving) for (let entry = 0; entry < plan.count; entry++) if (plan.despawned[entry] === 0) plan.to[entry] = close(state.archetypes[plan.to[entry]]).id;
        let index: IndexChanges | null = null;
        if (structure.referenceIds.length > 0) {
            linkBorn(state, born, written, tick);
            cascadeReferences(state, queued, written, entity => entryOf(state, entity));
            index = indexChangesOf(state, queued, entry => plan.from[entry] < 0 ? null : state.archetypes[plan.from[entry]]);
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
        state.syncing = { queued, reservations, reserved: state.entities.length, tick, born, index, deriving, isolated, unreserved };
    }
    catch (error) {
        // The next sync point's leak scan frees reservations whose spawns this one dropped.
        if (reservations !== null) state.carried = reservations;
        cleanUp(state, queued);
        throw error;
    }
};

/**
 * Stamps each typed array resource changed where the resource entity moved, as a resource joining the world moves it:
 * its value, the view of its elements in place, is another, which its observers are given.
 */
const stampMovedArrays = (state: State, tick: number): void => {
    const { plan } = state;
    const index = indexOf(state.resourceEntity);
    const entry = plan.slots[index];
    if (entry < 0 || entry >= plan.count || plan.entity[entry] !== state.resourceEntity || plan.from[entry] < 0 || plan.from[entry] === plan.to[entry]) return;
    const row = state.entities.row[index];
    for (const storage of state.archetypes[plan.to[entry]].storages) if (storage.layout.kind === "linear" && storage.layout.array !== undefined) stampChanged(storage, row, tick);
};

/** What a sync point whose sync systems threw nothing returns: read-only, so one is shared. */
const nothingThrown: readonly Thrown[] = [];

/**
 * The second half: runs sync systems against the plan, then applies it. A sync system that throws doesn't stop the sync
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
        if (state.recording !== null && !isolated) recordPlan(state, state.recording, queued, born);
        if (state.syncSystems.length > 0 && !isolated) {
            const thrown = runSyncSystems(state, queued, born, tick);
            errors = errors.length === 0 ? thrown : [...errors, ...thrown];
            // Sync systems reserve entities for their spawns; the next sync point accounts for them.
            if (reserved(state.entities)) state.carried = materialize(state.memory, state.entities);
        }
        sort(state, queued, tick);
        arrive(state, queued, tick, deriving);
        if (plan.pairs.leaving > 0) {
            if (state.claimed) for (let entry = plan.count - 1; entry >= 0; entry--) leaveLogged(state, entry);
            else for (let entry = plan.count - 1; entry >= 0; entry--) leave(state, entry);
        }
        if (state.resourceEntity >= 0) stampMovedArrays(state, tick);
        if (index !== null) applyIndexChanges(state, index);
        // A reservation whose spawn never arrived, from a chunk that failed after reserving, would otherwise leak its
        // index. Every spawn consumes one reservation and the rest were unreserved, so only a shortfall needs the scan,
        // which skips what's released already. Sync systems' reservations came after, so they're left for the next sync
        // point.
        if (plan.spawned + unreserved < reservations.reused.length + tableLength - reservations.firstNew) {
            const { list, count } = state.entities.released;
            const released = new Set(list.slice(0, count));
            const leaked = (index: number): boolean => (index >= plan.slots.length || plan.slots[index] < 0) && state.entities.archetype[index] < 0 && !released.has(index);
            for (const index of reservations.reused) if (leaked(index)) release(state.entities, index);
            for (let index = reservations.firstNew; index < tableLength; index++) if (leaked(index)) release(state.entities, index);
        }
        recycle(state.memory, state.entities);
        state.syncs++;
        // Archetypes of shared values left empty are reclaimed once they stayed so, and those the resource entity left
        // released (`reclaim.ts`).
        if (state.resourceEntity >= 0) noteResourceLeft(state);
        if (state.sharing) noteEmptied(state);
        if (state.sharing || state.emptied.length > 0) reclaimEmptied(state);
    }
    finally {
        cleanUp(state, queued);
    }
    // Only after a sync point that applied, so a failing one keeps its own error.
    for (const after of state.afterSync) after.deref()?.();
    return errors;
};

/** Applies every queued command as one sync point with a new tick, then empties the queue. */
export const synchronize = (state: State): void => {
    if (prepareSync(state)) applySync(state);
};

/**
 * Applies `buffer` alone as a sync point, leaving what's pending for the next run's: registration's changes between
 * runs, which no sync system sees.
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
        // An isolated sync point runs no sync systems, so it reserves nothing for the next one.
        state.carried = carried;
    }
};
