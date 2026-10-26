// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../../interface/entity/entity.js';
import type { Commands } from '../../interface/system/commands.js';
import type { Leaf } from '../../interface/system/leaf.js';
import type { SystemLookupLists } from '../../interface/system/access.js';
import { declarationOf, definitionOf, firstKeyOf, indexOfLookup, isLeaf, itemOfId, kindOf, labelOf, programFinalizers, threadOfDeclaration, watchedBy, whyUnregistered } from '../../interface/registry/index.js';
import { layoutOf, objectLayout, viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import type { StringStore } from './strings.js';
import { stampChanged, writeOf } from './archetype.js';
import { emptyViews } from './arrays.js';
import { arrivalsPosition, createDebts, membershipOf, type ArrivalsView } from './arrivals.js';
import { readCell, writeCell } from './cells.js';
import {
    beginCommand, createRingWriter, dropCommand, encoderOf, endSegment, localNumbers, objectStart, putComponent, putNull, putSlot, putStart, putValue,
    startSegment, type Encoder, type Extent, type Slots,
} from './command-ring.js';
import { addCommand, despawnCommand, removeCommand } from './buffer.js';
import { createBlock, endBlock, locate, reserveFrom, type Block } from './entities.js';
import { inputFor } from './input.js';
import { protocolName, type ToWorld } from './joining.js';
import { ownTag } from './move-log.js';
import { ranExecuted, ranSkipped } from './joined-observer.js';
import { applying, rebuild, replay, stage, waitStructure, type Mirror } from './mirror.js';
import type { WorkerError } from './protocol.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { combine, contributed, identityOf, reductionTargetsOf, type ReductionTarget } from './reductions.js';
import { changedRowOf, emptyRow, rowBinderOf, type RowHost } from './rows.js';
import { requiredOf } from './required.js';
import type { Since } from './index-lookups.js';
import { createBatch, noValues, positionalSpawner, type Positional, type SpawnBatch } from './staging.js';
import { createThreadFinalizers } from './thread-finalizers.js';
import { createThreadWhere } from './where.js';
import { createThreadIndex, type ThreadIndex } from './thread-indexes.js';
import type { EntityViews, ThreadArchetype, ThreadDirectory, ThreadStorage } from './thread-directory.js';
import { keptSorted } from './index-keys.js';
import { blockShift, chunkShift } from './kernel.js';
import {
    doneWord, endWord, headExecuted, headRan, progressWord, snapshotFlagsWord, snapshotLayout, snapshotOffsetWord, snapshotResourceArchetypeWord,
    snapshotResourceRowWord, snapshotRowsWord, snapshotCapacityWord, snapshotted, tailBlockWords, tailChunk, waitingWord,
} from './tail-blocks.js';
import { defaultOf, type Key } from './state.js';
import { isThenable, returnedPromise } from './failures.js';
import {
    completionCapacityWord, completionMessage, completionOffsetWord, completionSystems, executedFlag, failedFlag, payloadCapacityWord, payloadCount,
    payloadInput, payloadOffsetWord, payloadSequence, payloadSystems, ranFlag, resultEnd, resultFields, resultFlags, resultStart, ringBaseWord, ringCapacityWord,
    payloadSync, ringCursorWord, ringNeededWord, spilledFlag, systemFields, systemFolds, systemIndex, systemLastRun, systemTail, systemTick, systemTier, systemValued, valuedFlag,
    taskDoneWord, taskFailedWord, taskPostedWord,
} from './thread-tasks.js';

// A joined thread's systems (threads.md, "Systems on other threads"): runners over the world's archetypes as the layout
// directory describes them, struct columns and resources in shared memory, this thread's objects in its mirror
// (`mirror.ts`), with commands and spawns written into its command ring, run as tasks the world posts.

/** For tests: tails on this thread that read every row from a snapshot, being late, and that switched to one at a chunk. */
export const tailSnapshots = { late: 0, switched: 0 };

/**
 * A system or finalizer the world places on this thread: its index here, its id, and the world's numbers for the keys
 * it names; for a system, the byte offset of its removed word.
 */
/** A system the world places on this thread: its index here, id, keys' numbers, removed word, and by lookup name its index records. */
export type SystemSetup = { readonly index: number; readonly id: string; readonly keys: readonly (readonly [number, string])[]; readonly removed?: number; readonly indexes?: readonly (readonly [string, number])[] };

/** What the joined thread gives its systems. */
export type ThreadSystemsHost = {
    readonly memory: WebAssembly.Memory;
    readonly mirror: Mirror;
    /** This thread's view of the layout directory, over the same mirror. */
    readonly directory: ThreadDirectory;
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
    /** Whether it's declared `transfer`, so a staged value whose command drops is released. */
    readonly transfer: boolean;
    /** Whether it's shared, so only the world's thread spawns and adds it: its value chooses the archetype. */
    readonly shared: boolean;
};

/** The system that ran a task's commands, for their checks' errors. */
type Running = { error: unknown };

/** Whether a task's mirror is current, or why not (`bringCurrent`). */
type Readiness = "current" | "moved" | "held";

/**
 * Runs the systems the world places on this thread, as tasks it posts in the task block: each task's systems in order,
 * after replaying the mirror through the task's sync, writing each system's commands and spawns as a segment of the
 * command ring, its flags and folds into the completion, then storing the task done and waking the world.
 */
export const createThreadSystems = (host: ThreadSystemsHost) => {
    const { mirror, control, directory } = host;
    const { viewed, rows: rowHost, numbers, refreshEntities, archetypeAt, countOf, arrivals, resourceRow, tableCount } = directory;
    const refreshMemory = (): void => { directory.refresh(); };
    const runners: (ThreadRunner | null | undefined)[] = [];
    const inputs = new Map<number, unknown>();
    /** The task waiting for what it needs: its systems' setups, its input, or this thread's objects; -1 for none. */
    let pending = -1;
    const writer = createRingWriter();
    let block: Block | null = null;
    const unused: number[] = [];

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
    const spawners = new WeakMap<readonly unknown[], (values?: object) => Entity>();
    const spawnersByNumbers = new Map<string, (values?: object) => Entity>();

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
        if (declaration === undefined || kindOf(key) !== "component") throw new Error(kindOf(key) === "resource" ? `"${labelOf(key)}" is a resource, not a component.` : `"${labelOf(key)}" has no registered schema: ${whyUnregistered(key)}.`);
        if (declaration.derived === true) throw new Error(`"${labelOf(key)}" is derived, so only rules add and remove it.`);
        const layout = layoutOf(declaration.type);
        const own = ownObject(key);
        const thread = threadOfDeclaration(declaration);
        const number = numbers.get(first) ?? localNumbers + host.keyNumber(key);
        const entry: CommandKey = {
            number, layout, encoder: encoderOf(layout), own,
            elsewhere: layout.kind === "string" ? `"${labelOf(key)}" is a string, which only the world's thread writes, so a command on another thread gives it only its start.`
                : layout.kind === "object" && !own ? `"${labelOf(key)}" lives on thread "${thread ?? "world"}", so a command on another thread gives it only its start or null.` : null,
            start: layout.kind === "constant" ? layout.value : defaultOf(key),
            transfer: declaration.transfer === true,
            shared: declaration.shared === true,
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
        if (layout.kind !== "object" && layout.kind !== "string") {
            if (value === undefined) putStart(writer, number);
            else putValue(writer, number, key.encoder, value);
            return true;
        }
        if (value === undefined || value === key.start) putStart(writer, number);
        else if (value === null) putNull(writer, number);
        else if (key.own) putSlot(writer, number, stage(mirror, entity, number, value, sync, key.transfer));
        else {
            running.error ??= new Error(key.elsewhere ?? "");
            return false;
        }
        return true;
    };

    /** A key a spawn or add gives a value: never a shared component's, whose value chooses an archetype, which only the world's thread does. */
    const givenKeyOf = (key: unknown): CommandKey => {
        const entry = commandKeyOf(key);
        if (entry.shared) throw new Error(`"${labelOf(key)}" is shared: its value chooses an archetype, so only the world's thread spawns and adds it.`);
        return entry;
    };

    /** Spawns this thread stages of a list's components, into a batch per set, reserving entities in blocks. */
    const spawnerOf = (list: readonly unknown[]): ((values?: object) => Entity) => {
        const known = spawners.get(list);
        if (known !== undefined) return known;
        const listed = list.map(givenKeyOf);
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
        // An object's or a string's start is the world's to resolve.
        const positional: Positional = positionalSpawner(reserving, reserveFrom, target, ids, listed.map(entry => entry.layout.kind === "object" || entry.layout.kind === "string" ? objectStart : entry.start));
        const keysOfList = list.filter((key): key is Key => typeof key === "symbol");
        const args: unknown[] = new Array<unknown>(keysOfList.length);
        const spawn = (values: object = noValues): Entity => {
            for (let k = 0; k < keysOfList.length; k++) args[k] = Reflect.get(values, keysOfList[k]);
            if (!usedBatches.includes(target)) usedBatches.push(target);
            return Reflect.apply(positional, undefined, args);
        };
        spawners.set(list, spawn);
        spawnersByNumbers.set(order, spawn);
        return spawn;
    };

    /**
     * Spawns of a list with constants, which no shared component is among: the same function for one list's components
     * and one constants object, found by its identity here, reading each component's value from the constants or else
     * from what each spawn gives, and failing its system for one given in both.
     */
    const presetSpawners = new WeakMap<(values?: object) => Entity, WeakMap<object, (values?: object) => Entity>>();
    const presetSpawnerOf = (list: readonly unknown[], preset: object): ((values?: object) => Entity) => {
        const spawn = spawnerOf(list);
        let byPreset = presetSpawners.get(spawn);
        if (byPreset === undefined) presetSpawners.set(spawn, byPreset = new WeakMap());
        const known = byPreset.get(preset);
        if (known !== undefined) return known;
        const keysOfList = list.filter((key): key is Key => typeof key === "symbol");
        const merged: { [key: string | symbol]: unknown } = {};
        const spawned = (values: object = noValues): Entity => {
            for (const key of keysOfList) {
                const constant: unknown = Reflect.get(preset, key);
                const given: unknown = Reflect.get(values, key);
                if (constant !== undefined && given !== undefined) throw new Error(`A spawn gives "${labelOf(key)}" in both its calls: each component's value comes from one.`);
                merged[key] = constant === undefined ? given : constant;
            }
            return spawn(merged);
        };
        byPreset.set(preset, spawned);
        return spawned;
    };

    const empty = {};
    const commands: Commands = {
        // A second parameter rather than a rest one, which would allocate an array each call.
        spawn: (components: readonly unknown[], preset?: unknown) => {
            return typeof preset === "object" && preset !== null ? presetSpawnerOf(components, preset) : spawnerOf(components);
        },
        despawn: entity => beginCommand(writer, despawnCommand, entity),
        add: (entity: number, components: symbol | readonly symbol[], values?: unknown) => {
            if (typeof components === "symbol") {
                const key = givenKeyOf(components);
                beginCommand(writer, addCommand, entity);
                if (!putOne(key, entity, values)) dropCommand(writer);
                return;
            }
            // Every key is checked before anything is written.
            for (let k = 0; k < components.length; k++) givenKeyOf(components[k]);
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
        const key = commandKeysByNumber.get(component);
        return key?.own === true ? stage(mirror, entity, component, value, sync, key.transfer) : -1;
    };

    /** Writes the running system's segment: its commands, its spawns, and the reservations it left unused. */
    const writeSegment = (): Extent => {
        unused.length = 0;
        if (block !== null) endBlock(block, unused);
        const cursor = Atomics.load(control, ringCursorWord);
        if (writer.count === 0 && usedBatches.length === 0 && unused.length === 0) return { start: cursor, end: cursor, spill: null, transfer: null };
        const extent = endSegment(writer, viewed.views, Atomics.load(control, ringBaseWord) >>> 0, Atomics.load(control, ringCapacityWord), cursor,
            usedBatches.length === 0 ? noBatches : usedBatches, unused, slots);
        usedBatches.length = 0;
        Atomics.store(control, ringCursorWord, extent.end);
        Atomics.store(control, ringNeededWord, Atomics.load(control, ringNeededWord) + extent.end - extent.start + (extent.spill?.length ?? 0));
        return extent;
    };

    const runnerHost: RunnerHost = {
        rows: rowHost, archetypeAt, countOf, arrivals, tableCount, resourceRow, refreshEntities, commands, mirror,
        refresh: directory.refresh, replaced: directory.replaced,
        numberOf: directory.numberOf,
        layoutOf: directory.layoutOf,
        strings: directory.strings,
    };

    /** Takes the world's numbers for the keys of systems or finalizers it places here. */
    const name = directory.name;

    /** By index: the byte offset of the word the world sets once it removed the system there, which no task runs from then on. */
    const removedWords: (number | undefined)[] = [];
    /** By index: the block of its tail's last task, whose view goes with it. */
    const tailBlocks: (number | undefined)[] = [];
    /** Systems the world removed, dropped once the thread finished `sequence`, the last task posted before. */
    const unplacing: { readonly indexes: readonly number[]; readonly sequence: number }[] = [];

    /** Records the systems the world places here; one this thread never imported fails each task that names it. */
    const setup = (systems: readonly SystemSetup[]): void => {
        name(systems);
        for (const { index, id, removed, indexes } of systems) {
            const item = itemOfId(id);
            const definition = item === undefined ? undefined : definitionOf(item);
            runners[index] = definition === undefined || !isLeaf(definition) ? null : createThreadRunner(runnerHost, definition, new Map(indexes));
            removedWords[index] = removed;
        }
    };

    /** Drops what's held for removed systems no task runs again, and tells the world, so it may place their indexes again. */
    const dropUnplaced = (): void => {
        if (unplacing.length === 0) return;
        const done = Atomics.load(control, taskDoneWord);
        const dropped: number[] = [];
        for (let k = unplacing.length - 1; k >= 0; k--) {
            const { indexes, sequence } = unplacing[k];
            if (sequence > done) continue;
            unplacing.splice(k, 1);
            for (const index of indexes) {
                runners[index] = undefined;
                removedWords[index] = undefined;
                const block = tailBlocks[index];
                if (block !== undefined) tailControls.delete(block);
                tailBlocks[index] = undefined;
                dropped.push(index);
            }
        }
        if (dropped.length > 0) host.post({ protocol: protocolName, kind: "unplaced", indexes: dropped });
    };

    /** The world removed systems here: dropped once the last task posted before them is done. */
    const unplace = (indexes: readonly number[], sequence: number): void => {
        unplacing.push({ indexes, sequence });
        dropUnplaced();
    };

    const finalizers = createThreadFinalizers({
        mirror,
        refresh: directory.refresh,
        rows: rowHost,
        numberOf: runnerHost.numberOf,
        layoutOf: runnerHost.layoutOf,
        archetypeAt, countOf, tableCount, resourceRow,
        strings: directory.strings,
        failed: errors => host.post({ protocol: protocolName, kind: "finalized", errors }),
    });
    mirror.finalize = finalizers.through;

    /** Records the finalizers the world places here; one this thread never imported fails each group of its stops. */
    const setupFinalizers = (setups: readonly SystemSetup[]): void => {
        name(setups);
        finalizers.setup(setups.map(({ index, id }) => {
            const item = itemOfId(id);
            const leaf = programFinalizers().find(finalizer => finalizer === item);
            return { index, leaf: leaf?.kind === "finalizer" ? leaf : null };
        }));
    };

    /**
     * Brings the mirror up to the last published sync, which runs the finalizers of its stops: `"moved"` when its
     * rebuild found a sync point applying before or during it, so it can rebuild once that's applied, and `"held"`
     * while it waits for something else.
     */
    const bringCurrent = (): Readiness => {
        const replayed = replay(mirror);
        if (replayed === "held") return "held";
        if (replayed !== "lapped") return "current";
        const rebuilt = rebuild(mirror);
        return rebuilt === "rebuilt" ? "current" : rebuilt;
    };
    const current = (): boolean => bringCurrent() === "current";

    /** Whether a task can run: its systems known here, its input arrived, and the mirror through its sync. */
    const ready = (payload: Float64Array, count: number): Readiness => {
        for (let k = 0; k < count; k++) if (runners[payload[payloadSystems + k * systemFields + systemIndex]] === undefined) return "held";
        if (payload[payloadInput] !== 0 && !inputs.has(payload[payloadSequence])) return "held";
        return bringCurrent();
    };

    /** Views of the payload and completion, kept while the world keeps them where they are. */
    let payload: Float64Array<ArrayBufferLike> = new Float64Array(0);
    let completion: Float64Array<ArrayBufferLike> = new Float64Array(0);
    const viewTask = (): void => {
        const payloadOffset = Atomics.load(control, payloadOffsetWord) >>> 0;
        const completionOffset = Atomics.load(control, completionOffsetWord) >>> 0;
        const { buffer } = viewed;
        if (payload.buffer !== buffer || payload.byteOffset !== payloadOffset || payload.length !== Atomics.load(control, payloadCapacityWord) / 8) {
            payload = new Float64Array(buffer, payloadOffset, Atomics.load(control, payloadCapacityWord) / 8);
        }
        if (completion.buffer !== buffer || completion.byteOffset !== completionOffset || completion.length !== Atomics.load(control, completionCapacityWord) / 8) {
            completion = new Float64Array(buffer, completionOffset, Atomics.load(control, completionCapacityWord) / 8);
        }
    };

    /**
     * Fails every system of the posted task, when this thread can't run it: its memory is short of the world's, or its
     * views of it failed. It writes nothing the views would reach, as they may be stale: the failed word says the task
     * failed whole, and the message, of the sequence the world posted, why.
     */
    const failTask = (posted: number, error: unknown): void => {
        pending = -1;
        host.post({ protocol: protocolName, kind: "completed", sequence: posted, errors: [[0, errorOf(error)]], spills: [] });
        Atomics.store(control, taskFailedWord, posted);
        Atomics.store(control, taskDoneWord, posted);
        Atomics.notify(control, taskDoneWord);
    };

    /**
     * Runs the posted task, if any and it can run; else it waits for what it needs, and `process` runs it then. Returns
     * whether it finished one.
     */
    const process = (): boolean => {
        const posted = Atomics.load(control, taskPostedWord);
        if (posted === Atomics.load(control, taskDoneWord)) return false;
        try {
            runTask(posted);
        }
        catch (error) {
            failTask(posted, error);
        }
        dropUnplaced();
        return Atomics.load(control, taskDoneWord) === posted;
    };

    /** The objects tails of the task wrote from their snapshots, for the world to stamp. */
    const stamps: number[] = [];
    /** Views of tails' blocks by offset, kept while the memory's buffer is the same. */
    const tailControls = new Map<number, Int32Array>();
    const tailControl = (offset: number): Int32Array => {
        let control = tailControls.get(offset);
        if (control === undefined || control.buffer !== viewed.buffer) tailControls.set(offset, control = new Int32Array(viewed.buffer, offset, tailBlockWords));
        return control;
    };

    /**
     * A task waiting for a sync point to finish applying, to rebuild its mirror, runs once it has. One whose rebuild
     * found a sync point applied during it runs again after a turn of the event loop: nothing else may wake this thread
     * before the task is done, and sync points overlapping every rebuild mustn't keep it from its event loop.
     */
    let structureWaited = false;
    const retried = (): void => {
        structureWaited = false;
        process();
    };
    const retryAfterStructure = (moved: boolean): void => {
        if (structureWaited) return;
        if (applying(mirror)) {
            structureWaited = true;
            void waitStructure(mirror).then(retried);
        }
        else if (moved) {
            structureWaited = true;
            setTimeout(retried, 0);
        }
    };

    /**
     * Posts a task's message. A value that can't be posted, as one holding a function, fails its system instead, and
     * the message goes again without values.
     */
    const postCompleted = (sequence: number, errors: [number, WorkerError][] | null, spills: [number, Uint8Array][] | null, values: [number, unknown][] | null, transfer: ArrayBuffer[] | null): void => {
        const extra = stamps.length > 0 ? { stamps: [...stamps] } : {};
        try {
            host.post({ protocol: protocolName, kind: "completed", sequence, errors: errors ?? [], spills: spills ?? [], ...values === null ? {} : { values }, ...extra }, transfer ?? []);
        }
        catch (error) {
            if (values === null) throw error;
            const failed = errors ?? [];
            for (const [k] of values) {
                const at = completionSystems + k * resultFields + resultFlags;
                completion[at] = (completion[at] & ~valuedFlag) | failedFlag;
                failed.push([k, errorOf(new Error(`Its value can't be posted to the world's thread: ${error instanceof Error ? error.message : String(error)}`))]);
            }
            host.post({ protocol: protocolName, kind: "completed", sequence, errors: failed, spills: spills ?? [], ...extra }, transfer ?? []);
        }
    };

    const runTask = (posted: number): void => {
        refreshMemory();
        viewTask();
        const count = payload[payloadCount];
        const sequence = payload[payloadSequence];
        pending = sequence;
        const readiness = ready(payload, count);
        if (readiness !== "current") {
            retryAfterStructure(readiness === "moved");
            return;
        }
        pending = -1;
        refreshEntities();
        const input = inputs.get(sequence);
        inputs.delete(sequence);
        const numberedBefore = host.numbered();
        let errors: [number, WorkerError][] | null = null;
        let spills: [number, Uint8Array][] | null = null;
        let transfer: ArrayBuffer[] | null = null;
        let values: [number, unknown][] | null = null;
        let failedTier = -1;
        const folds = completionSystems + count * resultFields;
        stamps.length = 0;
        for (let k = 0; k < count; k++) {
            const base = payloadSystems + k * systemFields;
            const result = completionSystems + k * resultFields;
            const tier = payload[base + systemTier];
            completion[result + resultFlags] = 0;
            completion[result + resultStart] = completion[result + resultEnd] = 0;
            // A failed tier stops the task after it: later tiers are skipped.
            if (failedTier >= 0 && tier > failedTier) continue;
            const index = payload[base + systemIndex];
            // Removed since the task was posted: it runs no more, and gives back nothing.
            const removed = removedWords[index];
            if (removed !== undefined && Atomics.load(viewed.words, removed >>> 2) !== 0) continue;
            const runner = runners[index];
            const tick = payload[base + systemTick];
            rowHost.tick = sync = tick;
            running.error = undefined;
            startSegment(writer, { tick, archetype: 0, start: k });
            let flags = 0;
            let error: unknown = undefined;
            const tail = payload[base + systemTail];
            if (tail !== 0 && runner !== null && runner !== undefined) {
                tailBlocks[index] = tail;
                // A tail writes no commands, so no segment.
                const outcome = runner.runTail(payload[base + systemLastRun], input, tailControl(tail), payload[payloadSync], k, stamps);
                if (outcome.executed) flags |= executedFlag;
                if (outcome.ran) flags |= ranFlag;
                if (outcome.error !== undefined) {
                    flags |= failedFlag;
                    (errors ??= []).push([k, errorOf(outcome.error)]);
                }
                else if (outcome.value !== undefined && payload[base + systemValued] !== 0) {
                    flags |= valuedFlag;
                    (values ??= []).push([k, outcome.value]);
                }
                outcome.value = undefined;
                completion[result + resultFlags] = flags;
                continue;
            }
            if (runner === null || runner === undefined) error = new Error("A system the world placed on this thread isn't one this thread imported.");
            else {
                const outcome = runner.run(payload[base + systemLastRun], input);
                if (outcome.executed) flags |= executedFlag;
                if (outcome.ran) flags |= ranFlag;
                error = outcome.error ?? running.error;
                if (error === undefined && outcome.value !== undefined && payload[base + systemValued] !== 0) {
                    flags |= valuedFlag;
                    (values ??= []).push([k, outcome.value]);
                }
                outcome.value = undefined;
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
        const message = errors !== null || spills !== null || values !== null || stamps.length > 0 || host.numbered() !== numberedBefore || !host.worldWaits;
        completion[completionMessage] = message ? 1 : 0;
        if (message) postCompleted(sequence, errors, spills, values, transfer);
        Atomics.store(control, taskDoneWord, posted);
        Atomics.notify(control, taskDoneWord);
    };

    return {
        setup,
        setupFinalizers,
        /**
         * Runs the finalizers of stops published since this thread last replayed, if any, as it replays them; and
         * releases staged `transfer` values whose commands dropped.
         */
        finalize: (): void => {
            if (finalizers.pending() || mirror.stagedTransfers > 0) current();
        },
        /** Once the world is disposed: finalizers run for the stops published, then for every row they match. */
        disposed: (): void => {
            try {
                if (current()) finalizers.all();
            }
            catch (error) {
                host.post({ protocol: protocolName, kind: "finalized", errors: [[-1, errorOf(error)]] });
            }
        },
        /** A task's input, posted by message. */
        input: (sequence: number, input: unknown): void => {
            inputs.set(sequence, input);
            if (pending === sequence) process();
        },
        process,
        /** Whether a task waits for what it needs. */
        waiting: (): boolean => pending >= 0,
        unplace,
        /** For tests of what a thread holds: how many systems the world placed here that it keeps. */
        systems: (): number => runners.filter(runner => runner !== undefined).length,
    };
};

/** What a joined thread's runner needs of its systems' host. */
export type RunnerHost = {
    readonly rows: RowHost & { tick: number };
    readonly archetypeAt: (id: number) => ThreadArchetype | undefined;
    readonly countOf: (archetype: ThreadArchetype) => number;
    /** The ring of rows' moves between archetypes, which `where`'s points per archetype read (`arrivals.ts`). */
    readonly arrivals: () => ArrivalsView | null;
    readonly tableCount: () => number;
    readonly resourceRow: () => { readonly archetype: ThreadArchetype; readonly row: number } | null;
    readonly refreshEntities: () => EntityViews;
    readonly commands: Commands;
    readonly numberOf: (key: Key) => number;
    readonly layoutOf: (key: Key) => Layout | undefined;
    /** This thread's objects, null where it fills none. */
    readonly mirror: Mirror | null;
    /** Views of the memory again, once it grew, and `replaced` moved on if a view may have: its buffer. */
    readonly refresh: () => ArrayBufferLike;
    /** Moved on by `refresh` once any archetype's view may have changed, which index lookups' rows check (`thread-directory.ts`). */
    readonly replaced: { readonly count: number };
    /** The records strings' columns name. */
    readonly strings: StringStore;
};

/** One run's outcome: whether it took its tick, ran its rows, and its error. */
/** A body's value, or a throw failing its system when it's a promise or another thenable, which nothing awaits. */
const notThenable = (value: unknown): unknown => {
    if (isThenable(value)) throw new Error(returnedPromise);
    return value;
};

/** How a run of a system went: for one without components, what its body returned too. */
export type Outcome = { executed: boolean; ran: boolean; error: unknown; value: unknown };

export type ThreadRunner = {
    /** Runs it once, at the tick its host's rows stamp with. */
    readonly run: (lastRun: number, input: unknown) => Outcome;
    /**
     * Runs it once as a tail, through its block `control`, as of sync `sync`: claiming its rows in chunks where they
     * are, and from the snapshot once the world took one. Objects it wrote from the snapshot are pushed to `stamps`
     * as `position`, entity and component, for the world to stamp; -1 names the resource entity.
     */
    readonly runTail: (lastRun: number, input: unknown, control: Int32Array, sync: number, position: number, stamps: number[], first?: number, outcomeAt?: number) => Outcome;
    /** Stops it at once, from its next row on: its system was removed on this thread. */
    readonly halt: () => void;
    /** Writes its folds' leaves from `at`. */
    readonly writeFolds: (completion: Float64Array, at: number) => void;
};

const noRecords: ReadonlyMap<string, number> = new Map();

/** A resource's cell on this thread, as of a run. */
type ThreadCell = { storage: ThreadStorage | undefined; row: number };

/** Runs one system here, as the world's runner runs a main-thread system (`runner.ts`). */
export const createThreadRunner = (host: RunnerHost, leaf: Leaf, records: ReadonlyMap<string, number> = noRecords): ThreadRunner => {
    const { declaration } = leaf;
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased parameter types.
    const system: { body(subject: unknown, context?: unknown, input?: unknown): unknown } = leaf;
    const { components: query, resources } = declaration;
    const numberOf = host.numberOf;
    const required = requiredOf(query).map(numberOf);
    const excluded = (query?.not ?? []).map(numberOf);
    const addedIds = (query?.added ?? []).map(numberOf);
    const changedIds = (query?.changed ?? []).map(numberOf);
    const resourceChanged = (resources?.changed ?? []).map(numberOf);
    const filtered = addedIds.length + changedIds.length + resourceChanged.length > 0;
    const bindRow = rowBinderOf<ThreadArchetype>(host.rows, numberOf, query?.read ?? [], query?.write ?? [], query?.optional);
    const matches: number[] = [];
    let checked = 0;
    /** Its `where`, run here as on the world's thread (`where.ts`); null without one. */
    const where = query?.where === undefined ? null : createThreadWhere({ archetypeAt: host.archetypeAt, numberOf, resourceRow: host.resourceRow, tick: () => host.rows.tick - 1 }, query.where, query.whereReads ?? []);
    /** With `where` and change filters, each match's own last run, as on the world's thread. */
    const pointed = where !== null && filtered;
    const points: number[] = [];
    /** By archetype id, its match, or -1. */
    const matchOf: number[] = [];
    /** Its `lastRun` as of its run here: a new match's point, and a non-match's, whose rows it never saw. */
    let latest = 0;
    /** What archetypes owe for rows moved in from others, as on the world's thread. */
    const debts = pointed ? createDebts(points, matchOf, arrivalsPosition(host.arrivals())) : null;
    const oldestPoint = (): number => {
        let oldest = latest;
        for (let m = 0; m < matches.length; m++) if (points[m] < oldest) oldest = points[m];
        return oldest;
    };
    /** By match, its archetype's generation as matched: reused for other values (`reclaim.ts`), it's matched anew. */
    const generations: number[] = [];
    /**
     * The world's count of archetypes reclaimed and reused as it last looked, which it follows as it changes; null before
     * its first look, which sees every archetype as it is.
     */
    let followed: number | null = null;
    const isMatch = (archetype: ThreadArchetype): boolean => {
        const has = (id: number): boolean => archetype.components.includes(id);
        return !archetype.resource && !archetype.reclaimed && required.every(has) && !excluded.some(has);
    };
    const addMatch = (id: number, archetype: ThreadArchetype): void => {
        const m = matches.length;
        points[m] = latest;
        generations[m] = archetype.generation;
        matchOf[id] = m;
        matches.push(id);
    };
    const moveMatch = (from: number, to: number): void => {
        const id = matches[from];
        matches[to] = id;
        points[to] = points[from];
        generations[to] = generations[from];
        matchOf[id] = to;
        where?.move(from, to);
    };
    const swapMatches = (a: number, b: number): void => {
        if (a === b) return;
        const first = matches[a];
        const point = points[a];
        const generation = generations[a];
        matches[a] = matches[b];
        points[a] = points[b];
        generations[a] = generations[b];
        matchOf[matches[a]] = a;
        matches[b] = first;
        points[b] = point;
        generations[b] = generation;
        matchOf[first] = b;
        where?.swapped(a, b);
    };
    /** As on the world's thread: one evaluated by `where` stays among those evaluated. */
    const removeMatch = (m: number): void => {
        matchOf[matches[m]] = -1;
        let hole = m;
        if (where !== null && m < where.evaluated) {
            const edge = where.evaluated - 1;
            if (edge !== hole) moveMatch(edge, hole);
            hole = edge;
            where.forgetLast();
        }
        const last = matches.length - 1;
        if (hole !== last) moveMatch(last, hole);
        matches.length = points.length = generations.length = last;
    };
    /**
     * Once archetypes were reclaimed or reused: each match reclaimed leaves, each reused is matched anew, and each it
     * has seen and doesn't match is matched once reused, reading every record it has seen. Arrivals are read first, as
     * on the world's thread.
     */
    const followMembership = (): void => {
        debts?.read(host.arrivals(), host.rows.tick, host.tableCount(), latest, oldestPoint);
        for (let m = matches.length - 1; m >= 0; m--) {
            const archetype = host.archetypeAt(matches[m]);
            if (archetype === undefined || archetype.reclaimed) removeMatch(m);
            else if (archetype.generation !== generations[m]) {
                points[m] = latest;
                generations[m] = archetype.generation;
                if (where !== null && m < where.evaluated) {
                    swapMatches(m, where.evaluated - 1);
                    where.forgetLast();
                }
            }
        }
        for (let id = 0; id < checked; id++) {
            if ((matchOf[id] ?? -1) >= 0) continue;
            const archetype = host.archetypeAt(id);
            if (archetype !== undefined && isMatch(archetype)) addMatch(id, archetype);
        }
    };
    const refreshMatches = (): void => {
        const membership = membershipOf(host.arrivals());
        if (followed === null) followed = membership;
        else if (membership !== followed) {
            followed = membership;
            followMembership();
        }
        for (const count = host.tableCount(); checked < count; checked++) {
            const archetype = host.archetypeAt(checked);
            if (archetype === undefined) break;
            matchOf[checked] = -1;
            if (isMatch(archetype)) addMatch(checked, archetype);
        }
    };
    const ownInput = inputFor(leaf);
    const targets: readonly ReductionTarget[] = reductionTargetsOf(host.layoutOf, leaf.name, declaration);
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
    /** Its `lastRun` while it runs, which its lookups by entity compare with. */
    const lookupSince: Since = { value: 0 };
    /** Its lookups through indexes, whose views each run points at the index's arrays. */
    const threadIndexes: ThreadIndex[] = [];
    if (names.length > 0) {
        const lookups = own();
        for (const name of names) {
            const declared = declaration.lookup?.[name] ?? {};
            const index = indexOfLookup(declared);
            const record = records.get(name);
            let found: unknown;
            if (index === undefined || record === undefined) found = entityLookupOf(host, declared, lookupSince);
            else {
                const reads = declared.read ?? [];
                const threadIndex = createThreadIndex(host.rows, host.archetypeAt, host.replaced, {
                    layouts: index.declaration.key.map(key => {
                        const layout = host.layoutOf(key);
                        if (layout === undefined) throw new Error(`"${labelOf(key)}" has no registered schema: ${whyUnregistered(key)}.`);
                        return layout;
                    }),
                    sorted: keptSorted(index.declaration),
                    unique: index.declaration.unique === true,
                    reads,
                    readIds: reads.map(numberOf),
                    watched: watchedBy(declared).length,
                    record,
                });
                threadIndexes.push(threadIndex);
                found = threadIndex.lookup;
            }
            Object.defineProperty(lookups, name, { value: found, enumerable: true });
        }
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
    // A tail is terminal, so its context has no commands.
    const tailValue: object = own();
    for (const name of Object.getOwnPropertyNames(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (descriptor !== undefined) Object.defineProperty(tailValue, name, descriptor);
    }
    /** The current run's input, which the body takes after its context; kept until the next run, as its context is. */
    let runInput: unknown;
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
            if (storage !== undefined) filters.push({ ticks: storage.added, chunks: storage.chunkAdded, blocks: storage.blockAdded });
        }
        for (const id of changedIds) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) filters.push({ ticks: storage.changed, chunks: storage.chunkChanged, blocks: storage.blockChanged });
        }
        filterCache.set(archetype.id, { archetype, filters });
        return filters;
    };

    const runBody = (archetype: ThreadArchetype, count: number, since: number): void => {
        const row = bindRow(archetype);
        const subject = row.value;
        const input = runInput;
        const filters = filtersOf(archetype);
        if (since < 0 || filters.length === 0) {
            for (let index = 0; index < count; index++) {
                row.index = index;
                system.body(subject, value, input);
            }
            return;
        }
        forEachPassingRange(filters, since, 0, count, (start, end) => {
            for (let index = start; index < end; index++) {
                row.index = index;
                system.body(subject, value, input);
            }
        });
    };

    const outcome: Outcome = { executed: false, ran: false, error: undefined, value: undefined };
    /** Set once its system is removed on this thread: no row runs from then on. */
    let halted = false;
    const run = (lastRun: number, input: unknown): Outcome => {
        outcome.executed = outcome.ran = false;
        outcome.error = outcome.value = undefined;
        lookupSince.value = lastRun;
        try {
            // A system whose conditions don't hold is skipped, successfully, and keeps its `lastRun`.
            if (!holds()) return outcome;
            outcome.executed = true;
            const resourcesChanged = resourceChanged.length > 0 && resourcesChangedSince(lastRun);
            /** -1 passes every row. */
            const since = !filtered || resourcesChanged ? -1 : lastRun;
            bind();
            if (threadIndexes.length !== 0) {
                // Settles the count after `ready()` or `current()` may have rebuilt the mirror, since `runTask` settles before them.
                const buffer = host.refresh();
                for (let k = 0; k < threadIndexes.length; k++) threadIndexes[k].refresh(buffer);
            }
            runInput = ownInput(input);
            if (query === undefined) {
                outcome.ran = since < 0;
                if (outcome.ran) outcome.value = notThenable(system.body(value, runInput));
                return outcome;
            }
            if (since >= 0 && addedIds.length + changedIds.length === 0 && !pointed) return outcome;
            outcome.ran = true;
            latest = lastRun;
            refreshMatches();
            debts?.read(host.arrivals(), host.rows.tick, host.tableCount(), latest, oldestPoint);
            if (where !== null) where.refresh(matches);
            const list = where === null ? matches : where.passing;
            const listed = where === null ? matches.length : where.count;
            for (let k = 0; k < listed; k++) {
                const archetype = host.archetypeAt(list[k]);
                if (archetype === undefined) continue;
                let from = since;
                if (pointed && where !== null) {
                    const m = where.indices[k];
                    if (since >= 0) {
                        // Rows moved in since its point count as changed since their old archetype's.
                        const point = debts?.sinceOf(list[k], points[m]) ?? points[m];
                        from = resourceChanged.length > 0 && resourcesChangedSince(point) ? -1 : point;
                    }
                    points[m] = host.rows.tick;
                    debts?.settle(list[k]);
                    if (from >= 0 && addedIds.length + changedIds.length === 0) continue;
                }
                const count = host.countOf(archetype);
                if (count > 0) runBody(archetype, count, from);
            }
        }
        catch (error) {
            outcome.error = error;
        }
        return outcome;
    };

    // As a tail: its linear reads and resources, which a snapshot holds, and the objects it reads and writes, this
    // thread's, which it reads from its mirror at the snapshot's rows.
    const readKeys = query?.read ?? [];
    const writeKeys = query?.write ?? [];
    /** Its optional components, which rows from a snapshot have only where their archetype does. */
    const optionalNumbers = (query?.optional ?? []).map(numberOf);
    const linearReads: { readonly number: number; readonly layout: Columned }[] = [];
    const constantReads: { readonly number: number; readonly layout: Layout }[] = [];
    for (const key of readKeys) {
        const layout = host.layoutOf(key);
        // A string's snapshot column holds handles of records the world copied for it.
        if (layout?.kind === "linear" || layout?.kind === "string") linearReads.push({ number: numberOf(key), layout });
        else if (layout?.kind === "constant") constantReads.push({ number: numberOf(key), layout });
    }
    /** The shared components it reads, whose values a snapshot's rows take from their archetypes. */
    const sharedReads = constantReads.flatMap(({ number, layout }) => layout.kind === "constant" && layout.shared === true ? [number] : []);
    const objectKeys = [...new Set([...readKeys, ...writeKeys])].filter(key => host.layoutOf(key)?.kind === "object").map(numberOf);
    const writtenObjects = new Set(writeKeys.map(numberOf));
    const snapshotResources = resourceKeys.flatMap((key, k) => {
        const layout = host.layoutOf(key);
        return (layout?.kind === "linear" || layout?.kind === "string") && !writes.has(key) ? [{ k, layout }] : [];
    });
    const strides = linearReads.map(({ layout }) => layout.stride);
    const resourceStrides = snapshotResources.map(({ layout }) => layout.stride);
    /** Matched archetypes' views and counts as of the tail's head. */
    const tailArchetypes: (ThreadArchetype | undefined)[] = [];
    const tailCounts: number[] = [];

    /** Where the tail finished reading through; the world waits for it once it took a snapshot. */
    const finish = (control: Int32Array, through: number): void => {
        Atomics.store(control, doneWord, through);
        if (Atomics.load(control, waitingWord) !== 0) Atomics.notify(control, doneWord);
    };

    const runRows = (archetype: ThreadArchetype, start: number, end: number, since: number): void => {
        const row = bindRow(archetype);
        const subject = row.value;
        const input = runInput;
        const filters = filtersOf(archetype);
        if (since < 0 || filters.length === 0) {
            for (let index = start; index < end && !halted; index++) {
                row.index = index;
                system.body(subject, tailValue, input);
            }
            return;
        }
        forEachPassingRange(filters, since, start, end, (first, last) => {
            for (let index = first; index < last && !halted; index++) {
                row.index = index;
                system.body(subject, tailValue, input);
            }
        });
    };

    /** By match as of the head, with `where`: the tick its rows pass after, -2 for one `where` skips. */
    const tailSinces: number[] = [];
    /** Runs positions `from` to `to` where their rows are, over the archetypes as of the head. */
    const runPositions = (from: number, to: number, since: number): void => {
        let base = 0;
        for (let m = 0; m < tailCounts.length; m++) {
            const count = tailCounts[m];
            const start = Math.max(from - 1 - base, 0);
            const end = Math.min(to - 1 - base, count);
            const archetype = tailArchetypes[m];
            const passing = where === null ? since : tailSinces[m];
            if (end > start && archetype !== undefined && passing !== -2) runRows(archetype, start, end, passing);
            base += count;
            if (base >= to - 1) return;
        }
    };

    /** Where each entity's row is in the mirror, for a mirror rebuilt past the tail's sync. */
    const locations = (component: number): Map<number, { readonly values: unknown[]; readonly row: number }> => {
        const found = new Map<number, { readonly values: unknown[]; readonly row: number }>();
        for (const mirrored of host.mirror?.archetypes ?? []) {
            const column = mirrored?.byComponent[component];
            if (mirrored === null || mirrored === undefined || column === undefined) continue;
            for (let row = 0; row < mirrored.count; row++) found.set(mirrored.entities[row], { values: column.values, row });
        }
        return found;
    };

    /**
     * Runs the rest from the snapshot, from `position` on: its head too when `head`. Reads only the snapshot and this
     * thread's mirror, never the world's storages, which may have moved since; objects it writes go back to the mirror
     * after, and are stamped by the world.
     */
    const runSnapshot = (control: Int32Array, position: number, head: boolean, sync: number, input: unknown, at: number, stamps: number[]): void => {
        const buffer = host.refresh();
        const offset = Atomics.load(control, snapshotOffsetWord) >>> 0;
        const rows = Atomics.load(control, snapshotRowsWord);
        const flags = Atomics.load(control, snapshotFlagsWord);
        const placed = snapshotLayout(Atomics.load(control, snapshotCapacityWord), strides, resourceStrides);
        if (position === 0) tailSnapshots.late++;
        else tailSnapshots.switched++;
        const { mirror } = host;
        const tick = host.rows.tick;
        const bounded = mirror === null || mirror.through === (sync >>> 0);
        const resourceArchetype = Atomics.load(control, snapshotResourceArchetypeWord);
        const resourceRow = Atomics.load(control, snapshotResourceRowWord);
        // Resources: structs from the snapshot, this thread's objects from its mirror's resource row.
        const ownResources: { readonly k: number; readonly component: number; readonly storage: ThreadStorage }[] = [];
        resourceKeys.forEach((key, k) => {
            const layout = host.layoutOf(key);
            const component = resourceNumbers[k];
            if (layout === undefined) return;
            const copied = snapshotResources.findIndex(entry => entry.k === k);
            if (copied >= 0) {
                const stride = resourceStrides[copied];
                cells[k].storage = localStorage(component, layout, viewsOf(buffer, offset + placed.resources[copied], stride), [], 0, host.strings);
                cells[k].row = 0;
                return;
            }
            if (layout.kind === "object") {
                const value = mirror?.archetypes[resourceArchetype]?.byComponent[component]?.values[resourceRow];
                const storage = localStorage(component, layout, emptyViews, [value], 1, host.strings);
                cells[k].storage = storage;
                cells[k].row = 0;
                ownResources.push({ k, component, storage });
                return;
            }
            cells[k].storage = localStorage(component, layout, emptyViews, [], 0, host.strings);
            cells[k].row = 0;
        });
        if (head) {
            if ((flags & headExecuted) === 0) return;
            outcome.executed = true;
            outcome.ran = (flags & headRan) !== 0;
            runInput = ownInput(input);
            if (!outcome.ran) return;
            if (query === undefined) {
                outcome.value = notThenable(system.body(tailValue, runInput));
                writeBackResources(ownResources, resourceArchetype, resourceRow, tick, at, stamps);
                return;
            }
        }
        const positions = new Uint32Array(buffer, offset + placed.positions, rows);
        const archetypeIds = new Uint32Array(buffer, offset + placed.archetypes, rows);
        const rowsOf = new Uint32Array(buffer, offset + placed.rows, rows);
        const entities = new Float64Array(buffer, offset + placed.entities, rows);
        const storageById: ThreadStorage[] = [];
        linearReads.forEach(({ number, layout: linear }, k) => {
            storageById[number] = localStorage(number, linear, viewsOf(buffer, offset + placed.columns[k], rows * linear.stride), [], 0, host.strings);
        });
        // A shared component's value is each row's archetype's, bound a run of one archetype's rows at a time.
        for (const { number, layout: constant } of constantReads) if (constant.kind !== "constant" || constant.shared !== true) storageById[number] = localStorage(number, constant, emptyViews, [], 0, host.strings);
        const objects: { readonly number: number; readonly storage: ThreadStorage }[] = [];
        for (const number of objectKeys) {
            const values = new Array<unknown>(rows);
            const byEntity = bounded ? null : locations(number);
            for (let i = 0; i < rows; i++) {
                if (byEntity === null) values[i] = mirror?.archetypes[archetypeIds[i]]?.byComponent[number]?.values[rowsOf[i]];
                else {
                    const location = byEntity.get(entities[i]);
                    values[i] = location?.values[location.row];
                }
            }
            const storage = localStorage(number, objectLayout, emptyViews, values, writtenObjects.has(number) ? rows : 0, host.strings);
            storageById[number] = storage;
            if (writtenObjects.has(number)) objects.push({ number, storage });
        }
        let first = 0;
        while (first < rows && positions[first] < position) first++;
        // With `where`, rows of archetypes it skips don't run: the copy holds every matched row then (`headOf`).
        const skipped = where === null ? null : new Set(matches.filter((_, m) => tailSinces[m] === -2));
        const copied = (storages: readonly (ThreadStorage | undefined)[]): ThreadArchetype =>
            ({ id: -1, entities, storageById: storages, record: -1, version: -1, mirrored: null, components: [], resource: false, reclaimed: false, generation: 0 });
        const ownedInput = runInput;
        try {
            if (optionalNumbers.length === 0 && sharedReads.length === 0) {
                const row = bindRow(copied(storageById));
                const subject = row.value;
                for (let index = first; index < rows && !halted; index++) {
                    if (skipped !== null && skipped.has(archetypeIds[index])) continue;
                    row.index = index;
                    system.body(subject, tailValue, ownedInput);
                }
            }
            else {
                // Rows of archetypes that lack optional components run in a row without them, a run of one archetype's rows
                // at a time, and every archetype with the same ones shares its copy of the snapshot's columns; with
                // shared components, each archetype has its own, holding its values.
                const byPattern = new Map<number, ThreadArchetype>();
                for (let index = first; index < rows && !halted;) {
                    const id = archetypeIds[index];
                    let end = index + 1;
                    while (end < rows && archetypeIds[end] === id) end++;
                    if (skipped !== null && skipped.has(id)) {
                        index = end;
                        continue;
                    }
                    const components = host.archetypeAt(id)?.components ?? [];
                    let pattern = 0;
                    for (let k = 0; k < optionalNumbers.length; k++) if (components.includes(optionalNumbers[k])) pattern |= 1 << k;
                    const key = sharedReads.length === 0 ? pattern : -1 - id;
                    let archetype = byPattern.get(key);
                    if (archetype === undefined) {
                        const storages: (ThreadStorage | undefined)[] = [...storageById];
                        optionalNumbers.forEach((number, k) => { if ((pattern & (1 << k)) === 0) storages[number] = undefined; });
                        const viewed = sharedReads.length === 0 ? undefined : host.archetypeAt(id);
                        for (const number of sharedReads) {
                            const layout = viewed?.storageById[number]?.layout;
                            storages[number] = layout === undefined ? undefined : localStorage(number, layout, emptyViews, [], 0, host.strings);
                        }
                        byPattern.set(key, archetype = copied(storages));
                    }
                    const row = bindRow(archetype);
                    const subject = row.value;
                    for (; index < end && !halted; index++) {
                        row.index = index;
                        system.body(subject, tailValue, ownedInput);
                    }
                }
            }
        }
        finally {
            // What it wrote goes back to the mirror, where its rows are now.
            for (const { number, storage } of objects) {
                const byEntity = bounded ? null : locations(number);
                for (let i = first; i < rows; i++) {
                    if (storage.changed[i] !== tick) continue;
                    if (byEntity === null) {
                        const column = mirror?.archetypes[archetypeIds[i]]?.byComponent[number];
                        if (column !== undefined) column.values[rowsOf[i]] = storage.values[i];
                    }
                    else {
                        const location = byEntity.get(entities[i]);
                        if (location !== undefined) location.values[location.row] = storage.values[i];
                    }
                    stamps.push(at, entities[i], number);
                }
            }
            writeBackResources(ownResources, resourceArchetype, resourceRow, tick, at, stamps);
        }
    };

    const writeBackResources = (resources: readonly { readonly component: number; readonly storage: ThreadStorage }[], archetype: number, row: number, tick: number, at: number, stamps: number[]): void => {
        for (const { component, storage } of resources) {
            if (storage.changed[0] !== tick) continue;
            const column = host.mirror?.archetypes[archetype]?.byComponent[component];
            if (column !== undefined) column.values[row] = storage.values[0];
            stamps.push(at, -1, component);
        }
    };

    /**
     * `first` is its first claim when the caller made it; with `outcomeAt`, the word of `control` whether it ran, and
     * took its tick, is stored at before its done word.
     */
    const runTail = (lastRun: number, input: unknown, control: Int32Array, sync: number, at: number, stamps: number[], first?: number, outcomeAt?: number): Outcome => {
        outcome.executed = outcome.ran = false;
        outcome.error = outcome.value = undefined;
        lookupSince.value = lastRun;
        let claimed = first ?? Atomics.add(control, progressWord, tailChunk);
        const end = Atomics.load(control, endWord);
        try {
            // An observer system on this thread looks up through indexes as the world wrote them into its records.
            if (threadIndexes.length !== 0) {
                const buffer = host.refresh();
                for (let k = 0; k < threadIndexes.length; k++) threadIndexes[k].refresh(buffer);
            }
            if (claimed >= snapshotted) {
                runSnapshot(control, 0, true, sync, input, at, stamps);
                return outcome;
            }
            // The head, within the first claim: conditions, resources and the archetypes as of the tail's sync.
            if (!holds()) return outcome;
            outcome.executed = true;
            const resourcesChanged = resourceChanged.length > 0 && resourcesChangedSince(lastRun);
            const since = !filtered || resourcesChanged ? -1 : lastRun;
            bind();
            runInput = ownInput(input);
            if (query === undefined) {
                outcome.ran = since < 0;
                if (outcome.ran) outcome.value = notThenable(system.body(tailValue, runInput));
                return outcome;
            }
            if (since >= 0 && addedIds.length + changedIds.length === 0 && !pointed) return outcome;
            outcome.ran = true;
            latest = lastRun;
            refreshMatches();
            debts?.read(host.arrivals(), host.rows.tick, host.tableCount(), latest, oldestPoint);
            tailArchetypes.length = tailCounts.length = 0;
            for (let m = 0; m < matches.length; m++) {
                const archetype = host.archetypeAt(matches[m]);
                tailArchetypes.push(archetype);
                tailCounts.push(archetype === undefined ? 0 : host.countOf(archetype));
            }
            if (where !== null) {
                where.refresh(matches);
                for (let m = 0; m < matches.length; m++) tailSinces[m] = -2;
                for (let k = 0; k < where.count; k++) {
                    const m = where.indices[k];
                    const archetype = tailArchetypes[m];
                    let from = since;
                    if (pointed && since >= 0 && archetype !== undefined) {
                        const point = debts?.sinceOf(matches[m], points[m]) ?? points[m];
                        from = resourceChanged.length > 0 && resourcesChangedSince(point) ? -1 : point;
                    }
                    if (pointed) {
                        points[m] = host.rows.tick;
                        debts?.settle(matches[m]);
                    }
                    tailSinces[m] = pointed && from >= 0 && addedIds.length + changedIds.length === 0 ? -2 : from;
                }
            }
            let from = 1;
            for (;;) {
                const to = Math.min(claimed + tailChunk, end);
                if (from < to) runPositions(from, to, since);
                if (to >= end) return outcome;
                finish(control, to);
                const next = to;
                claimed = Atomics.add(control, progressWord, tailChunk);
                if (claimed >= snapshotted) {
                    runSnapshot(control, next, false, sync, input, at, stamps);
                    return outcome;
                }
                from = claimed;
            }
        }
        catch (error) {
            outcome.error = error;
            return outcome;
        }
        finally {
            if (outcomeAt !== undefined) Atomics.store(control, outcomeAt, outcome.executed ? ranExecuted : ranSkipped);
            finish(control, end);
        }
    };

    const writeFolds = (completion: Float64Array, at: number): void => {
        let offset = at;
        for (const accumulators of reduced) for (let i = 0; i < accumulators.length; i++) completion[offset++] = accumulators[i];
    };

    return { run, runTail, writeFolds, halt: () => { halted = true; } };
};

/** A layout with a column in linear memory: a struct's, or a string's of handles. */
type Columned = Extract<Layout, { readonly stride: number }>;

/** A storage over a snapshot's column, or of values only this thread holds, with ticks of its own for `ticked` rows. */
const localStorage = (component: number, layout: Layout, views: Views, values: unknown[], ticked: number, strings: StringStore): ThreadStorage => {
    const chunks = ticked === 0 ? 0 : (ticked >> chunkShift) + 1;
    const blocks = ticked === 0 ? 0 : (ticked >> blockShift) + 1;
    return {
        component, layout, views, strings: layout.kind === "string" ? strings : null, values, ...writeOf(layout), tags: noTags, ticked: ticked > 0,
        added: ticked === 0 ? noTicks : new Float64Array(ticked), changed: ticked === 0 ? noTicks : new Float64Array(ticked),
        chunkAdded: chunks === 0 ? noTicks : new Float64Array(chunks), chunkChanged: chunks === 0 ? noTicks : new Float64Array(chunks),
        blockAdded: blocks === 0 ? noTicks : new Float64Array(blocks), blockChanged: blocks === 0 ? noTicks : new Float64Array(blocks),
    };
};

/** What a lookup reads and requires: its reads but its optional components, which an entity it finds may lack. */
const requiredReads = (host: RunnerHost, lookup: SystemLookupLists): readonly number[] => {
    const optional = "optional" in lookup ? lookup.optional ?? [] : [];
    return (lookup.read ?? []).filter(key => !optional.includes(key)).map(host.numberOf);
};

/** A lookup returning `read` values keyed by component, from this thread's views. */
const lookupOf = (host: RunnerHost, lookup: SystemLookupLists) => {
    const read = (lookup.read ?? []).map(host.numberOf);
    const required = requiredReads(host, lookup);
    const has = ("has" in lookup ? lookup.has ?? [] : []).map(host.numberOf);
    const not = ("not" in lookup ? lookup.not ?? [] : []).map(host.numberOf);
    const keys = lookup.read ?? [];
    return (entity: Entity): object | null => {
        const table = host.refreshEntities();
        const index = locate(table, entity);
        if (index < 0) return null;
        const archetype = host.archetypeAt(table.archetype[index]);
        if (archetype === undefined || archetype.resource) return null;
        const { components } = archetype;
        for (const id of required) if (!components.includes(id)) return null;
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

/** A lookup reading nothing, from this thread's views: the shared empty row for every entity it finds. */
const emptyLookupOf = (host: RunnerHost, lookup: SystemLookupLists) => {
    const has = ("has" in lookup ? lookup.has ?? [] : []).map(host.numberOf);
    const not = ("not" in lookup ? lookup.not ?? [] : []).map(host.numberOf);
    return (entity: Entity): object | null => {
        const table = host.refreshEntities();
        const index = locate(table, entity);
        if (index < 0) return null;
        const archetype = host.archetypeAt(table.archetype[index]);
        if (archetype === undefined || archetype.resource) return null;
        const { components } = archetype;
        for (const id of has) if (!components.includes(id)) return null;
        for (const id of not) if (components.includes(id)) return null;
        return emptyRow;
    };
};

/**
 * A lookup with `changed`, from this thread's views: one row reused, its `read` values keyed by component, and whether
 * a component `watched` names may have changed in it after `since`. A GPU kernel's column stamps reach this thread as
 * row ticks; a component keeping no ticks counts as changed.
 */
const changedLookupOf = (host: RunnerHost, lookup: SystemLookupLists, watched: readonly Key[], since: Since) => {
    const read = (lookup.read ?? []).map(host.numberOf);
    const required = requiredReads(host, lookup);
    const has = ("has" in lookup ? lookup.has ?? [] : []).map(host.numberOf);
    const not = ("not" in lookup ? lookup.not ?? [] : []).map(host.numberOf);
    const ids = watched.map(host.numberOf);
    const keys = lookup.read ?? [];
    const found = changedRowOf(keys);
    return (entity: Entity): object | null => {
        const table = host.refreshEntities();
        const index = locate(table, entity);
        if (index < 0) return null;
        const archetype = host.archetypeAt(table.archetype[index]);
        if (archetype === undefined || archetype.resource) return null;
        const { components, storageById } = archetype;
        for (const id of required) if (!components.includes(id)) return null;
        for (const id of has) if (!components.includes(id)) return null;
        for (const id of not) if (components.includes(id)) return null;
        const row = table.row[index];
        for (let i = 0; i < keys.length; i++) {
            const storage = storageById[read[i]];
            found[keys[i]] = storage === undefined ? undefined : readCell(storage, row);
        }
        let changed = since.value < 0;
        for (let i = 0; i < ids.length && !changed; i++) {
            const storage = storageById[ids[i]];
            changed = storage === undefined || !storage.ticked || storage.changed[row] > since.value;
        }
        found.changed = changed;
        return found;
    };
};

/** The lookup by entity a declaration chooses, once: with `changed`, reading nothing, or reading values. */
const entityLookupOf = (host: RunnerHost, lookup: SystemLookupLists, since: Since) => {
    const watched = "index" in lookup ? undefined : lookup.changed;
    if (watched !== undefined) return changedLookupOf(host, lookup, watched, since);
    return (lookup.read ?? []).length === 0 ? emptyLookupOf(host, lookup) : lookupOf(host, lookup);
};
