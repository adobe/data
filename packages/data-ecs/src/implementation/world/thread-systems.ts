import type { Entity } from '../../interface/entity/entity.js';
import type { Commands } from '../../interface/system/commands.js';
import type { Leaf } from '../../interface/system/leaf.js';
import type { Lookup } from '../../interface/system/access.js';
import { declarationOf, definitionOf, firstKeyOf, isLeaf, isWorldWritten, itemOfId, keyOfId, kindOf, labelOf, threadOfDeclaration } from '../../interface/registry/index.js';
import { layoutOf, viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { stampChanged, writeOf } from './archetype.js';
import { emptyViews } from './arrays.js';
import { readCell, writeCell } from './cells.js';
import {
    beginCommand, createRingWriter, dropCommand, encoderOf, endSegment, localNumbers, objectStart, putComponent, putNull, putSlot, putStart, putValue,
    startSegment, type Encoder, type Extent, type Slots,
} from './command-ring.js';
import { addCommand, despawnCommand, removeCommand } from './buffer.js';
import { createBlock, endBlock, locate, reserveFrom, tableLength, type Block } from './entities.js';
import { inputFor } from './input.js';
import { protocolName, type ToWorld } from './joining.js';
import {
    archetypeField, capacityField, cursorField, entitiesVersionField, entitiesWord, freeCapacityField, freeField, generationField, linearFlag,
    recordCapacity, recordCount, recordEntities, recordFlags, recordStorages, recordVersion, recordWords, remoteFlag, resourceEntityWord, resourceFlag,
    rowField, storageAdded, storageChanged, storageChunkAdded, storageChunkChanged, storageChunks, storageColumn, storageComponent, storageFlags,
    storageWords, tableLengthWord, tableOffsetWord, threadShift, tickedFlag,
} from './layout-directory.js';
import { pageBytes, pagesWord } from './memory.js';
import { ownTag } from './move-log.js';
import { rebuild, replay, stage, type Mirror, type Mirrored } from './mirror.js';
import type { WorkerError } from './protocol.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { combine, contributed, identityOf, reductionTargetsOf, type ReductionTarget } from './reductions.js';
import { rowBinderOf, type Row, type RowArchetype, type RowHost, type RowStorage } from './rows.js';
import { createBatch, positionalSpawner, type Positional, type SpawnBatch } from './staging.js';
import { defaultOf, type Key } from './state.js';
import {
    completionCapacityWord, completionMessage, completionOffsetWord, completionSystems, executedFlag, failedFlag, payloadCapacityWord, payloadCount,
    payloadInput, payloadOffsetWord, payloadSequence, payloadSystems, ranFlag, resultEnd, resultFields, resultFlags, resultStart, ringBaseWord, ringCapacityWord,
    ringCursorWord, ringNeededWord, spilledFlag, systemFields, systemFolds, systemIndex, systemLastRun, systemTick, systemTier, taskDoneWord,
    taskPostedWord,
} from './thread-tasks.js';

// A joined thread's systems (threads.md, "Systems on other threads"): runners over the world's archetypes as the layout
// directory describes them, struct columns and resources in shared memory, this thread's objects in its mirror
// (`mirror.ts`), with commands and spawns written into its command ring, run as tasks the world posts.


/** A system the world places on this thread: its index here, its id, and the world's numbers for the keys it names. */
export type SystemSetup = { readonly index: number; readonly id: string; readonly keys: readonly (readonly [number, string])[] };

/** A joined thread's view of a storage of the world's, in shared memory, or of this thread's objects, in its mirror. */
type ThreadStorage = RowStorage & { readonly component: number };

/** A joined thread's view of one of the world's archetypes, by its record, as of its version and the mirror's columns. */
type ThreadArchetype = RowArchetype & {
    readonly record: number;
    readonly version: number;
    readonly mirrored: Mirrored | null | undefined;
    readonly buffer: ArrayBufferLike;
    readonly components: readonly number[];
    readonly resource: boolean;
    readonly storageById: readonly (ThreadStorage | undefined)[];
};

type EntityViews = { cursor: Int32Array; free: Int32Array; generation: Uint32Array; archetype: Int32Array; row: Uint32Array; length: number };

/** What the joined thread gives its systems. */
export type ThreadSystemsHost = {
    readonly memory: WebAssembly.Memory;
    readonly mirror: Mirror;
    /** The task block's words (`thread-tasks.ts`). */
    readonly control: Int32Array;
    /** The logical threads this thread fills. */
    readonly claims: ReadonlySet<string>;
    /** Whether the world waits without blocking, so `Atomics.notify` wakes it; else a message does. */
    readonly worldWaits: boolean;
    readonly post: (message: ToWorld, transfer?: readonly ArrayBuffer[]) => void;
    /** This thread's number for a key, its id posted the first time; throws for a key without one. */
    readonly keyNumber: (key: Key) => number;
    /** How many of this thread's numbers were posted, so a task that posted more says a message follows. */
    readonly numbered: () => number;
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

const noTicks = new Float64Array(0);
const noTags = new Uint32Array(0);
const noValues: unknown[] = [];
const noBatches: readonly SpawnBatch[] = [];

/** A command's key: what it is to the world, and how this thread writes its values. */
type CommandKey = {
    readonly number: number;
    readonly layout: Layout;
    readonly encoder: Encoder;
    /** Whether its values are this thread's objects, staged here; else, for an object, why only its start or null crosses. */
    readonly own: boolean;
    readonly elsewhere: string | null;
    readonly start: unknown;
};

/** The system that ran a task's commands, for their checks' errors. */
type Running = { error: unknown };

/**
 * Runs the systems the world places on this thread, as tasks it posts in the task block: each task's systems in order,
 * after replaying the mirror through the task's sync, writing each system's commands and spawns as a segment of the
 * command ring, its flags and folds into the completion, then storing the task done and waking the world.
 */
export const createThreadSystems = (host: ThreadSystemsHost) => {
    const { memory, mirror, control } = host;
    let buffer: ArrayBufferLike = new ArrayBuffer(0);
    let words = new Uint32Array(0);
    let memoryViews: Views = emptyViews;
    let pages = -1;
    /** By the world's number: what its key is here, and its layout, for the keys this thread's systems name. */
    const keys: (Key | undefined)[] = [];
    const layouts: Layout[] = [];
    const numbers = new Map<Key, number>();
    const archetypes: (ThreadArchetype | undefined)[] = [];
    let entities: EntityViews | null = null;
    let entitiesVersion = -1;
    const runners: (ThreadRunner | null | undefined)[] = [];
    const inputs = new Map<number, unknown>();
    /** The task waiting for what it needs: its systems' setups, its input, or this thread's objects; -1 for none. */
    let pending = -1;
    const writer = createRingWriter();
    let block: Block | null = null;
    const unused: number[] = [];
    const rowHost: RowHost & { tick: number } = { layouts, rows: new Map<string, Row>(), tick: 0 };

    /** Views of the memory again, once it grew; every archetype's views with them. */
    const refreshMemory = (): void => {
        if (words.length === 0) words = new Uint32Array(memory.buffer);
        const current = Atomics.load(words, pagesWord);
        if (current === pages) return;
        const latest = memory.buffer;
        if (latest.byteLength < current * pageBytes) throw new Error(`This thread's memory is ${latest.byteLength} bytes, short of the ${current * pageBytes} the world stored.`);
        buffer = latest;
        words = new Uint32Array(latest);
        memoryViews = viewsOf(latest, 0, latest.byteLength);
        pages = current;
        archetypes.length = 0;
        entitiesVersion = -1;
    };

    const refreshEntities = (): EntityViews => {
        const record = entitiesWord;
        const version = Atomics.load(words, record + entitiesVersionField);
        if (entities === null || version !== entitiesVersion) {
            const capacity = words[record + capacityField];
            const views: EntityViews = {
                cursor: new Int32Array(buffer, words[record + cursorField], 4),
                free: new Int32Array(buffer, words[record + freeField], words[record + freeCapacityField]),
                archetype: new Int32Array(buffer, words[record + archetypeField], capacity),
                row: new Uint32Array(buffer, words[record + rowField], capacity),
                generation: new Uint32Array(buffer, words[record + generationField], capacity),
                length: 0,
            };
            if (entities === null) entities = views;
            // Spawners hold the table, so it's updated in place.
            else Object.assign(entities, views);
            entitiesVersion = version;
        }
        entities.length = entities.cursor[tableLength];
        return entities;
    };

    /** A storage's view, by its record's words; this thread's objects by their mirror column. */
    const storageOf = (base: number, capacity: number, mirrored: Mirrored | null | undefined): ThreadStorage | undefined => {
        const component = words[base + storageComponent];
        const layout = layouts[component];
        if (layout === undefined) return undefined;
        const flags = words[base + storageFlags];
        const ticked = (flags & tickedFlag) !== 0;
        const own = (flags & remoteFlag) !== 0 && flags >>> threadShift === mirror.thread;
        const chunks = words[base + storageChunks];
        const added = ticked ? new Float64Array(buffer, words[base + storageAdded], capacity) : noTicks;
        const changed = ticked ? new Float64Array(buffer, words[base + storageChanged], capacity) : noTicks;
        return {
            component,
            layout,
            ...writeOf(layout),
            views: layout.kind === "linear" && (flags & linearFlag) !== 0 ? viewsOf(buffer, words[base + storageColumn], capacity * layout.stride) : emptyViews,
            // Rows only this thread's systems write: a mirror's column, or one of its own while the mirror has none.
            values: own ? mirrored?.byComponent[component]?.values ?? [] : noValues,
            tags: own ? new Uint32Array(buffer, words[base + storageColumn], capacity) : noTags,
            ticked,
            added,
            // A constant's `changed` ticks are its `added` ticks.
            changed: layout.kind === "constant" ? added : changed,
            chunkAdded: ticked ? new Float64Array(buffer, words[base + storageChunkAdded], chunks) : noTicks,
            chunkChanged: ticked ? new Float64Array(buffer, words[layout.kind === "constant" ? base + storageChunkAdded : base + storageChunkChanged], chunks) : noTicks,
        };
    };

    const viewArchetype = (id: number, record: number, version: number, mirrored: Mirrored | null | undefined): ThreadArchetype => {
        const capacity = words[record + recordCapacity];
        const storageById: (ThreadStorage | undefined)[] = [];
        const components: number[] = [];
        for (let s = 0; s < words[record + recordStorages]; s++) {
            const base = record + recordWords + s * storageWords;
            components.push(words[base + storageComponent]);
            const storage = storageOf(base, capacity, mirrored);
            if (storage !== undefined) storageById[storage.component] = storage;
        }
        return {
            id, record, version, mirrored, buffer, components, storageById,
            resource: (words[record + recordFlags] & resourceFlag) !== 0,
            entities: new Float64Array(buffer, words[record + recordEntities], capacity),
        };
    };

    /** An archetype's view: one load of its record's version, and new views only once it, or the mirror, moved on. */
    const archetypeAt = (id: number): ThreadArchetype | undefined => {
        const cached = archetypes[id];
        const mirrored = mirror.archetypes[id];
        if (cached !== undefined && cached.mirrored === mirrored && Atomics.load(words, cached.record + recordVersion) === cached.version) return cached;
        const offset = cached?.record ?? (id < Atomics.load(words, tableLengthWord) ? words[(words[tableOffsetWord] >> 2) + id] >> 2 : 0);
        if (offset === 0) return undefined;
        return archetypes[id] = viewArchetype(id, offset, Atomics.load(words, offset + recordVersion), mirrored);
    };

    const countOf = (archetype: ThreadArchetype): number => words[archetype.record + recordCount];

    /** The resource entity's archetype and row, or null before resources exist. */
    const resourceRow = (): { readonly archetype: ThreadArchetype; readonly row: number } | null => {
        const word = Atomics.load(words, resourceEntityWord);
        if (word === 0) return null;
        const table = refreshEntities();
        const index = word - 1;
        const archetype = archetypeAt(table.archetype[index]);
        return archetype === undefined ? null : { archetype, row: table.row[index] };
    };

    const tableCount = (): number => Atomics.load(words, tableLengthWord);

    /** Whether a component's values are objects of a thread this one fills. */
    const ownObject = (key: Key): boolean => {
        const declaration = declarationOf(key);
        const thread = declaration === undefined ? null : threadOfDeclaration(declaration);
        return thread !== null && host.claims.has(thread) && layoutOf(declaration?.type).kind === "object";
    };

    const commandKeys = new Map<Key, CommandKey>();
    const commandKeysByNumber = new Map<number, CommandKey>();
    /** By sorted numbers of a list's components, the batch its spawns stage into, and by list, its spawner. */
    const batches = new Map<string, SpawnBatch>();
    const usedBatches: SpawnBatch[] = [];
    /** Spawners by list, and by the numbers of a list's components in its order, for lists made again each call. */
    const spawners = new WeakMap<readonly unknown[], (values: object) => Entity>();
    const spawnersByNumbers = new Map<string, (values: object) => Entity>();

    /** A key a command names: checked as the world's commands check it, numbered by the world's number or this thread's. */
    const commandKeyOf = (key: unknown): CommandKey => {
        if (typeof key !== "symbol") throw new Error(Array.isArray(key) ? "A command names a list of components where one component's symbol goes." : `"${labelOf(key)}" isn't a component: a component's key is a symbol.`);
        const direct = commandKeys.get(key);
        if (direct !== undefined) return direct;
        const first = firstKeyOf(key);
        const known = commandKeys.get(first);
        if (known !== undefined) {
            commandKeys.set(key, known);
            return known;
        }
        const declaration = declarationOf(key);
        if (declaration === undefined || kindOf(key) !== "component") throw new Error(kindOf(key) === "resource" ? `"${labelOf(key)}" is a resource, not a component.` : `"${labelOf(key)}" has no registered schema; import the module that registers it.`);
        if (declaration.derived === true) throw new Error(`"${labelOf(key)}" is derived, so only rules add and remove it.`);
        if (isWorldWritten(key)) throw new Error(`"${labelOf(key)}" is written only by the world.`);
        const layout = layoutOf(declaration.type);
        const own = ownObject(key);
        const thread = threadOfDeclaration(declaration);
        const number = numbers.get(first) ?? localNumbers + host.keyNumber(key);
        const entry: CommandKey = {
            number, layout, encoder: encoderOf(layout), own,
            elsewhere: layout.kind === "object" && !own ? `"${labelOf(key)}" lives on thread "${thread ?? "world"}", so a command on another thread gives it only its start or null.` : null,
            start: layout.kind === "constant" ? layout.value : defaultOf(key),
        };
        commandKeys.set(first, entry);
        commandKeys.set(key, entry);
        commandKeysByNumber.set(number, entry);
        return entry;
    };

    /** The system whose commands are being written, so a value that can't cross fails it. */
    const running: Running = { error: undefined };
    /** The tick of the system running, which staged values settle by. */
    let sync = 0;

    /** Writes one value of an add: a struct's bytes; an object of this thread staged; another's start or null, else dropped. */
    const putOne = (key: CommandKey, entity: number, value: unknown): boolean => {
        const { layout, number } = key;
        if (layout.kind !== "object") {
            if (value === undefined) putStart(writer, number);
            else putValue(writer, number, key.encoder, value);
            return true;
        }
        if (value === undefined || value === key.start) putStart(writer, number);
        else if (value === null) putNull(writer, number);
        else if (key.own) putSlot(writer, number, stage(mirror, entity, number, value, sync));
        else {
            running.error ??= new Error(key.elsewhere ?? "");
            return false;
        }
        return true;
    };

    /** Spawns this thread stages of a list's components, into a batch per set, reserving entities in blocks. */
    const spawnerOf = (list: readonly unknown[]): ((values: object) => Entity) => {
        const known = spawners.get(list);
        if (known !== undefined) return known;
        const listed = list.map(commandKeyOf);
        const ids = listed.map(entry => entry.number);
        const order = ids.join(",");
        const same = spawnersByNumbers.get(order);
        if (same !== undefined) {
            spawners.set(list, same);
            return same;
        }
        if (new Set(ids).size !== ids.length) throw new Error("A spawn names a component twice.");
        const sorted = [...ids].sort((a, b) => a - b);
        const signature = sorted.join(",");
        let batch = batches.get(signature);
        if (batch === undefined) {
            const byNumber: Layout[] = [];
            listed.forEach(entry => { byNumber[entry.number] = entry.layout; });
            batch = createBatch(byNumber, ids);
            for (const column of batch.columns) {
                const entry = listed.find(candidate => candidate.number === column.id);
                if (entry?.elsewhere !== null) column.remote = entry?.elsewhere ?? null;
            }
            batches.set(signature, batch);
        }
        const target = batch;
        const reserving = block ??= createBlock(refreshEntities());
        // An object's start is the world's to resolve.
        const positional: Positional = positionalSpawner(reserving, reserveFrom, target, ids, listed.map(entry => entry.layout.kind === "object" ? objectStart : entry.start));
        const keysOfList = list.filter((key): key is Key => typeof key === "symbol");
        const args: unknown[] = new Array<unknown>(keysOfList.length);
        const spawn = (values: object): Entity => {
            for (let k = 0; k < keysOfList.length; k++) args[k] = Reflect.get(values, keysOfList[k]);
            if (!usedBatches.includes(target)) usedBatches.push(target);
            return Reflect.apply(positional, undefined, args);
        };
        spawners.set(list, spawn);
        spawnersByNumbers.set(order, spawn);
        return spawn;
    };

    const empty = {};
    const commands: Commands = {
        spawn: components => spawnerOf(components),
        despawn: entity => beginCommand(writer, despawnCommand, entity),
        add: (entity: number, components: symbol | readonly symbol[], values?: unknown) => {
            if (typeof components === "symbol") {
                const key = commandKeyOf(components);
                beginCommand(writer, addCommand, entity);
                if (!putOne(key, entity, values)) dropCommand(writer);
                return;
            }
            // Every key is checked before anything is written.
            for (let k = 0; k < components.length; k++) commandKeyOf(components[k]);
            const given = typeof values === "object" && values !== null ? values : empty;
            beginCommand(writer, addCommand, entity);
            let crosses = true;
            for (let k = 0; k < components.length; k++) if (!putOne(commandKeyOf(components[k]), entity, Reflect.get(given, components[k]))) crosses = false;
            if (!crosses) dropCommand(writer);
        },
        remove: (entity: number, components: symbol | readonly symbol[]) => {
            if (typeof components === "symbol") {
                const { number } = commandKeyOf(components);
                beginCommand(writer, removeCommand, entity);
                putComponent(writer, number);
                return;
            }
            for (let k = 0; k < components.length; k++) commandKeyOf(components[k]);
            beginCommand(writer, removeCommand, entity);
            for (let k = 0; k < components.length; k++) putComponent(writer, commandKeyOf(components[k]).number);
        },
    };

    /** Stages a value a spawn gives this thread's object, as its segment is written. */
    const slots: Slots = (component, entity, value) => {
        if (value === undefined || value === null || value === objectStart) return -1;
        return commandKeysByNumber.get(component)?.own === true ? stage(mirror, entity, component, value, sync) : -1;
    };

    /** Writes the running system's segment: its commands, its spawns, and the reservations it left unused. */
    const writeSegment = (): Extent => {
        unused.length = 0;
        if (block !== null) endBlock(block, unused);
        const cursor = Atomics.load(control, ringCursorWord);
        if (writer.count === 0 && usedBatches.length === 0 && unused.length === 0) return { start: cursor, end: cursor, spill: null, transfer: null };
        const extent = endSegment(writer, memoryViews, Atomics.load(control, ringBaseWord) >>> 0, Atomics.load(control, ringCapacityWord), cursor,
            usedBatches.length === 0 ? noBatches : usedBatches, unused, slots);
        usedBatches.length = 0;
        Atomics.store(control, ringCursorWord, extent.end);
        Atomics.store(control, ringNeededWord, Atomics.load(control, ringNeededWord) + extent.end - extent.start + (extent.spill?.length ?? 0));
        return extent;
    };

    const runnerHost: RunnerHost = {
        rows: rowHost, archetypeAt, countOf, tableCount, resourceRow, refreshEntities, commands,
        numberOf: key => {
            const number = numbers.get(firstKeyOf(key));
            if (number === undefined) throw new Error(`"${labelOf(key)}" has no number from the world here.`);
            return number;
        },
        layoutOf: key => layouts[numbers.get(firstKeyOf(key)) ?? -1],
    };

    /** Records the systems the world places here; one this thread never imported fails each task that names it. */
    const setup = (systems: readonly SystemSetup[]): void => {
        for (const { keys: named } of systems) {
            for (const [number, id] of named) {
                const key = keyOfId(id);
                if (key === undefined || keys[number] !== undefined) continue;
                keys[number] = key;
                numbers.set(firstKeyOf(key), number);
                layouts[number] = layoutOf(declarationOf(key)?.type);
                // Views hold storages only of components with layouts here, so they're made again.
                archetypes.length = 0;
            }
        }
        for (const { index, id } of systems) {
            const item = itemOfId(id);
            const definition = item === undefined ? undefined : definitionOf(item);
            runners[index] = definition === undefined || !isLeaf(definition) ? null : createThreadRunner(runnerHost, definition);
        }
    };

    /** Whether a task can run: its systems known here, its input arrived, and the mirror through its sync. */
    const ready = (payload: Float64Array, count: number): boolean => {
        for (let k = 0; k < count; k++) if (runners[payload[payloadSystems + k * systemFields + systemIndex]] === undefined) return false;
        if (payload[payloadInput] !== 0 && !inputs.has(payload[payloadSequence])) return false;
        const replayed = replay(mirror);
        if (replayed === "held") return false;
        if (replayed === "lapped" && !rebuild(mirror)) return false;
        return true;
    };

    /** Views of the payload and completion, kept while the world keeps them where they are. */
    let payload: Float64Array<ArrayBufferLike> = new Float64Array(0);
    let completion: Float64Array<ArrayBufferLike> = new Float64Array(0);
    const viewTask = (): void => {
        const payloadOffset = Atomics.load(control, payloadOffsetWord) >>> 0;
        const completionOffset = Atomics.load(control, completionOffsetWord) >>> 0;
        if (payload.buffer !== buffer || payload.byteOffset !== payloadOffset || payload.length !== Atomics.load(control, payloadCapacityWord) / 8) {
            payload = new Float64Array(buffer, payloadOffset, Atomics.load(control, payloadCapacityWord) / 8);
        }
        if (completion.buffer !== buffer || completion.byteOffset !== completionOffset || completion.length !== Atomics.load(control, completionCapacityWord) / 8) {
            completion = new Float64Array(buffer, completionOffset, Atomics.load(control, completionCapacityWord) / 8);
        }
    };

    /**
     * Fails every system of the posted task, when this thread can't run it: its memory is short of the world's, or its
     * views of it failed.
     */
    const failTask = (posted: number, error: unknown): void => {
        pending = -1;
        const count = payload.length > payloadCount ? payload[payloadCount] : 0;
        const failure = errorOf(error);
        const errors: [number, WorkerError][] = [];
        for (let k = 0; k < count && completion.length >= completionSystems + (k + 1) * resultFields; k++) {
            const result = completionSystems + k * resultFields;
            completion[result + resultFlags] = failedFlag;
            completion[result + resultStart] = completion[result + resultEnd] = 0;
            errors.push([k, failure]);
        }
        if (completion.length > completionMessage) completion[completionMessage] = 1;
        host.post({ protocol: protocolName, kind: "completed", sequence: payload.length > payloadSequence ? payload[payloadSequence] : posted, errors, spills: [] });
        Atomics.store(control, taskDoneWord, posted);
        Atomics.notify(control, taskDoneWord);
    };

    /** Runs the posted task, if any and it can run; else it waits for what it needs, and `process` runs it then. */
    const process = (): void => {
        const posted = Atomics.load(control, taskPostedWord);
        if (posted === Atomics.load(control, taskDoneWord)) return;
        try {
            runTask(posted);
        }
        catch (error) {
            failTask(posted, error);
        }
    };

    const runTask = (posted: number): void => {
        refreshMemory();
        viewTask();
        const count = payload[payloadCount];
        const sequence = payload[payloadSequence];
        pending = sequence;
        if (!ready(payload, count)) return;
        pending = -1;
        refreshEntities();
        const input = inputs.get(sequence);
        inputs.delete(sequence);
        const numberedBefore = host.numbered();
        let errors: [number, WorkerError][] | null = null;
        let spills: [number, Uint8Array][] | null = null;
        let transfer: ArrayBuffer[] | null = null;
        let failedTier = -1;
        const folds = completionSystems + count * resultFields;
        for (let k = 0; k < count; k++) {
            const base = payloadSystems + k * systemFields;
            const result = completionSystems + k * resultFields;
            const tier = payload[base + systemTier];
            completion[result + resultFlags] = 0;
            completion[result + resultStart] = completion[result + resultEnd] = 0;
            // A failed tier stops the task after it: later tiers are skipped.
            if (failedTier >= 0 && tier > failedTier) continue;
            const runner = runners[payload[base + systemIndex]];
            const tick = payload[base + systemTick];
            rowHost.tick = sync = tick;
            running.error = undefined;
            startSegment(writer, { tick, archetype: 0, start: k });
            let flags = 0;
            let error: unknown = undefined;
            if (runner === null || runner === undefined) error = new Error("A system the world placed on this thread isn't one this thread imported.");
            else {
                const outcome = runner.run(tick, payload[base + systemLastRun], input);
                if (outcome.executed) flags |= executedFlag;
                if (outcome.ran) flags |= ranFlag;
                error = outcome.error ?? running.error;
            }
            try {
                const extent = writeSegment();
                completion[result + resultStart] = extent.start;
                completion[result + resultEnd] = extent.end;
                if (extent.spill !== null && extent.transfer !== null) {
                    flags |= spilledFlag;
                    (spills ??= []).push([k, extent.spill]);
                    (transfer ??= []).push(extent.transfer);
                }
            }
            catch (thrown) {
                error ??= thrown;
            }
            if (error !== undefined) {
                flags |= failedFlag;
                (errors ??= []).push([k, errorOf(error)]);
                failedTier = tier;
            }
            else if (runner !== null && runner !== undefined && (flags & ranFlag) !== 0) runner.writeFolds(completion, folds + payload[base + systemFolds]);
            completion[result + resultFlags] = flags;
        }
        const message = errors !== null || spills !== null || host.numbered() !== numberedBefore || !host.worldWaits;
        completion[completionMessage] = message ? 1 : 0;
        if (message) host.post({ protocol: protocolName, kind: "completed", sequence, errors: errors ?? [], spills: spills ?? [] }, transfer ?? []);
        Atomics.store(control, taskDoneWord, posted);
        Atomics.notify(control, taskDoneWord);
    };

    return {
        setup,
        /** A task's input, posted by message. */
        input: (sequence: number, input: unknown): void => {
            inputs.set(sequence, input);
            if (pending === sequence) process();
        },
        process,
        /** Whether a task waits for what it needs. */
        waiting: (): boolean => pending >= 0,
    };
};

/** What a joined thread's runner needs of its systems' host. */
type RunnerHost = {
    readonly rows: RowHost & { tick: number };
    readonly archetypeAt: (id: number) => ThreadArchetype | undefined;
    readonly countOf: (archetype: ThreadArchetype) => number;
    readonly tableCount: () => number;
    readonly resourceRow: () => { readonly archetype: ThreadArchetype; readonly row: number } | null;
    readonly refreshEntities: () => EntityViews;
    readonly commands: Commands;
    readonly numberOf: (key: Key) => number;
    readonly layoutOf: (key: Key) => Layout | undefined;
};

/** One run's outcome: whether it took its tick, ran its rows, and its error. */
type Outcome = { executed: boolean; ran: boolean; error: unknown };

type ThreadRunner = {
    readonly run: (tick: number, lastRun: number, input: unknown) => Outcome;
    /** Writes its folds' leaves from `at`. */
    readonly writeFolds: (completion: Float64Array, at: number) => void;
};

/** A resource's cell on this thread, as of a run. */
type ThreadCell = { storage: ThreadStorage | undefined; row: number };

/** Runs one system here, as the world's runner runs a main-thread system (`runner.ts`). */
const createThreadRunner = (host: RunnerHost, leaf: Leaf): ThreadRunner => {
    const { declaration } = leaf;
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased parameter types.
    const system: { body(subject: unknown, context?: unknown): void } = leaf;
    const { components: query, resources } = declaration;
    const numberOf = host.numberOf;
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(numberOf);
    const excluded = (query?.not ?? []).map(numberOf);
    const addedIds = (query?.added ?? []).map(numberOf);
    const changedIds = (query?.changed ?? []).map(numberOf);
    const resourceChanged = (resources?.changed ?? []).map(numberOf);
    const filtered = addedIds.length + changedIds.length + resourceChanged.length > 0;
    const bindRow = rowBinderOf<ThreadArchetype>(host.rows, numberOf, query?.read ?? [], query?.write ?? []);
    const matches: number[] = [];
    let checked = 0;
    const refreshMatches = (): void => {
        for (const count = host.tableCount(); checked < count; checked++) {
            const archetype = host.archetypeAt(checked);
            if (archetype === undefined) break;
            const has = (id: number): boolean => archetype.components.includes(id);
            if (!archetype.resource && required.every(has) && !excluded.some(has)) matches.push(checked);
        }
    };
    const ownInput = inputFor(leaf);
    const targets: readonly ReductionTarget[] = reductionTargetsOf(host.layoutOf, declaration);
    const reduced = targets.map(target => new Float64Array(target.leaves.length));

    // The context: resources, lookups, reductions, input and commands, each under its own key when declared.
    const own = (): object => Object.create({});
    const value: { input?: unknown } = own();
    const writes = new Set<Key>(resources?.write);
    const resourceKeys = [...new Set<Key>([...resources?.read ?? [], ...resources?.is ?? [], ...writes])];
    const cells: ThreadCell[] = resourceKeys.map(() => ({ storage: undefined, row: 0 }));
    const resourceNumbers = resourceKeys.map(numberOf);
    const cellFor = (k: number): ThreadCell => {
        const cell = cells[k];
        if (cell.storage === undefined) throw new Error(`Resource "${labelOf(resourceKeys[k])}" isn't in this world.`);
        return cell;
    };
    if (resourceKeys.length > 0) {
        const values = own();
        resourceKeys.forEach((key, k) => {
            Object.defineProperty(values, key, {
                get: () => {
                    const { storage, row } = cellFor(k);
                    return storage === undefined ? undefined : readCell(storage, row);
                },
                set: writes.has(key) ? (next: unknown) => {
                    const { storage, row } = cellFor(k);
                    if (storage === undefined) return;
                    writeCell(storage, row, next);
                    if (storage.tags.length !== 0) storage.tags[row] = ownTag;
                    stampChanged(storage, row, host.rows.tick);
                } : undefined,
                enumerable: true,
            });
        });
        Object.defineProperty(value, "resources", { value: values, enumerable: true });
    }
    const names = Object.keys(declaration.lookup ?? {});
    if (names.length > 0) {
        const lookups = own();
        for (const name of names) Object.defineProperty(lookups, name, { value: lookupOf(host, declaration.lookup?.[name] ?? {}), enumerable: true });
        Object.defineProperty(value, "lookup", { value: lookups, enumerable: true });
    }
    if (targets.length > 0) {
        const reducers = own();
        targets.forEach((target, t) => {
            const accumulators = reduced[t];
            const { operator, leaves } = target;
            Object.defineProperty(reducers, target.key, {
                value: (contribution: unknown): void => {
                    for (let i = 0; i < leaves.length; i++) accumulators[i] = combine(operator, accumulators[i] ?? NaN, contributed(contribution, leaves[i]?.path ?? []));
                },
                enumerable: true,
            });
        });
        Object.defineProperty(value, "reduce", { value: reducers, enumerable: true });
    }
    if (declaration.input !== undefined) value.input = undefined;
    Object.defineProperty(value, "commands", { value: host.commands, enumerable: true });

    /** Resolves resource cells for a run: they move only at sync points. */
    const bind = (): void => {
        const found = resourceKeys.length === 0 ? null : host.resourceRow();
        for (let k = 0; k < resourceKeys.length; k++) {
            cells[k].storage = found?.archetype.storageById[resourceNumbers[k]];
            cells[k].row = found?.row ?? 0;
        }
        for (let t = 0; t < targets.length; t++) reduced[t].fill(identityOf(targets[t].operator));
    };

    const conditionIs = (resources?.is ?? []).map(numberOf);
    const conditionNot = (resources?.not ?? []).map(numberOf);
    const conditions = [...conditionIs, ...conditionNot];
    const holding = (found: { readonly archetype: ThreadArchetype; readonly row: number } | null, id: number): boolean => {
        const storage = found?.archetype.storageById[id];
        if (storage === undefined || found === null) return false;
        const held = readCell(storage, found.row);
        return held !== null && held !== false;
    };
    const holds = (): boolean => {
        if (conditions.length === 0) return true;
        const found = host.resourceRow();
        return conditionIs.every(id => holding(found, id)) && !conditionNot.some(id => holding(found, id));
    };
    const resourcesChangedSince = (since: number): boolean => {
        const found = host.resourceRow();
        if (found === null) return false;
        for (const id of resourceChanged) {
            const storage = found.archetype.storageById[id];
            if (storage !== undefined && storage.changed[found.row] > since) return true;
        }
        return false;
    };

    /** By archetype, its change filters, as of its view. */
    const filterCache = new Map<number, { readonly archetype: ThreadArchetype; readonly filters: readonly Filter[] }>();
    const filtersOf = (archetype: ThreadArchetype): readonly Filter[] => {
        const cached = filterCache.get(archetype.id);
        if (cached !== undefined && cached.archetype === archetype) return cached.filters;
        const filters: Filter[] = [];
        for (const id of addedIds) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) filters.push({ ticks: storage.added, chunks: storage.chunkAdded });
        }
        for (const id of changedIds) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) filters.push({ ticks: storage.changed, chunks: storage.chunkChanged });
        }
        filterCache.set(archetype.id, { archetype, filters });
        return filters;
    };

    const runBody = (archetype: ThreadArchetype, count: number, since: number): void => {
        const row = bindRow(archetype);
        const subject = row.value;
        const filters = filtersOf(archetype);
        if (since < 0 || filters.length === 0) {
            for (let index = 0; index < count; index++) {
                row.index = index;
                system.body(subject, value);
            }
            return;
        }
        forEachPassingRange(filters, since, 0, count, (start, end) => {
            for (let index = start; index < end; index++) {
                row.index = index;
                system.body(subject, value);
            }
        });
    };

    const outcome: Outcome = { executed: false, ran: false, error: undefined };
    const run = (tick: number, lastRun: number, input: unknown): Outcome => {
        outcome.executed = outcome.ran = false;
        outcome.error = undefined;
        try {
            // A system whose conditions don't hold is skipped, successfully, and keeps its `lastRun`.
            if (!holds()) return outcome;
            outcome.executed = true;
            const resourcesChanged = resourceChanged.length > 0 && resourcesChangedSince(lastRun);
            /** -1 passes every row. */
            const since = !filtered || resourcesChanged ? -1 : lastRun;
            bind();
            if (declaration.input !== undefined) value.input = ownInput(input);
            if (query === undefined) {
                outcome.ran = since < 0;
                if (outcome.ran) system.body(value);
                return outcome;
            }
            if (since >= 0 && addedIds.length + changedIds.length === 0) return outcome;
            outcome.ran = true;
            refreshMatches();
            for (let m = 0; m < matches.length; m++) {
                const archetype = host.archetypeAt(matches[m]);
                if (archetype === undefined) continue;
                const count = host.countOf(archetype);
                if (count > 0) runBody(archetype, count, since);
            }
        }
        catch (error) {
            outcome.error = error;
        }
        return outcome;
    };

    const writeFolds = (completion: Float64Array, at: number): void => {
        let offset = at;
        for (const accumulators of reduced) for (let i = 0; i < accumulators.length; i++) completion[offset++] = accumulators[i];
    };

    return { run, writeFolds };
};

/** A lookup returning `read` values keyed by component, from this thread's views. */
const lookupOf = (host: RunnerHost, lookup: Lookup) => {
    const read = (lookup.read ?? []).map(host.numberOf);
    const has = (lookup.has ?? []).map(host.numberOf);
    const not = (lookup.not ?? []).map(host.numberOf);
    const keys = lookup.read ?? [];
    return (entity: Entity): object | null => {
        const table = host.refreshEntities();
        const index = locate(table, entity);
        if (index < 0) return null;
        const archetype = host.archetypeAt(table.archetype[index]);
        if (archetype === undefined || archetype.resource) return null;
        const { components } = archetype;
        for (const id of read) if (!components.includes(id)) return null;
        for (const id of has) if (!components.includes(id)) return null;
        for (const id of not) if (components.includes(id)) return null;
        const row = table.row[index];
        const values: { [key: Key]: unknown } = {};
        for (let i = 0; i < keys.length; i++) {
            const storage = archetype.storageById[read[i]];
            values[keys[i]] = storage === undefined ? undefined : readCell(storage, row);
        }
        return values;
    };
};
