import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { createBuffer, addCommand, pushCommand, pushComponent, removeCommand, type CommandBuffer } from "./buffer.js";
import { readCell } from "./cells.js";
import { createCommands } from "./commands.js";
import { asEntity, indexOf, locate as locateHere } from "./entities.js";
import { recordCount, structureWord, tableOffsetWord } from "./layout-directory.js";
import { cellOf, createMirror, locate, nameComponent, rebuild, replay, stage, waitStructure, type Mirror } from "./mirror.js";
import { createMoveLog, markDelivered, ownTag, slotValue, type MoveLog } from "./move-log.js";
import { claimThreads } from "./remote.js";
import { createState, defaultOf, idOf, startTicking, type State } from "./state.js";
import { applySync, prepareSync, synchronize } from "./synchronize.js";

// The move log on one thread: a world whose objects of thread "moveLogTest" a mirror fills, against an inline world given
// the same commands, compared after every sync point by each entity's id.

const uid = Symbol("moveLogTest/uid");
const amount = Symbol("moveLogTest/amount");
const flag = Symbol("moveLogTest/flag");
const label = Symbol("moveLogTest/label");
const note = Symbol("moveLogTest/note");
const own = Symbol("moveLogTest/own");
declare module "@adobe/data-ecs" {
    export interface Threads {
        moveLogTest: true;
    }
    export interface Components {
        [uid]: { type: number };
        [amount]: { type: number };
        [flag]: { type: true };
        [label]: { type: string | null; thread: "moveLogTest" };
        [note]: { type: Note | null; thread: "moveLogTest" };
        [own]: { type: string };
    }
}
Component.register(uid, { type: { type: "number" } });
Component.register(amount, { type: { type: "number" } });
Component.register(flag, { type: { const: true } });
/** A value that isn't data. */
type Note = { readonly text: string; readonly read: () => string };
Component.register(label, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "none" }, thread: "moveLogTest" });
Component.register(note, { thread: "moveLogTest" });
Component.register(own, { type: { type: "string" } });

const remoteKeys = [label, note] as const;

/** A deterministic generator, so a failure replays. */
const random = (seed: number) => {
    let state = seed >>> 0;
    return (): number => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
};

/** A world whose "moveLogTest" objects a mirror on this thread fills, its log holding at least `minimum` entries. */
const threaded = (minimum: number): { readonly state: State; readonly mirror: Mirror; readonly log: MoveLog } => {
    const state = createState(true);
    let mirror: Mirror | null = null;
    const log = createMoveLog(state.memory, 1, state.starts, component => {
        const key = state.keys[component];
        if (mirror !== null && typeof key === "symbol") nameComponent(mirror, component, key, defaultOf);
    }, minimum);
    mirror = createMirror(state.memory.memory, log.block, 1);
    for (const key of [uid, amount, flag, own, ...remoteKeys]) idOf(state, key);
    claimThreads(state, log, ["moveLogTest"]);
    return { state, mirror, log };
};

const inline = (): State => {
    const state = createState(true);
    for (const key of [uid, amount, flag, own, ...remoteKeys]) idOf(state, key);
    // As the threaded world keeps them for the thread's objects.
    startTicking(state, remoteKeys.map(key => idOf(state, key)));
    return state;
};

/** Brings the mirror up to the last sync point, rebuilding when its log lapped it. */
const follow = (mirror: Mirror): void => {
    const replayed = replay(mirror);
    if (replayed === "lapped") expect(rebuild(mirror)).toBe(true);
    else expect(replayed).toBe("current");
};

/** Every live entity of a world with its archetype and row. */
const liveRows = (state: State): { readonly entity: number; readonly archetype: number; readonly row: number }[] =>
    state.archetypes.flatMap(archetype => archetype.resource ? [] : Array.from({ length: archetype.count }, (_, row) => ({ entity: archetype.entities[row], archetype: archetype.id, row })));

/** The id an entity's row holds. */
const idAt = (state: State, archetype: number, row: number): unknown => {
    const storage = state.archetypes[archetype].storageById[idOf(state, uid)];
    return storage === undefined ? undefined : readCell(storage, row);
};

/** The inline world's objects and ticks against the mirror's, by entity id, and the threaded world's rows against the inline's. */
const compare = (reference: State, world: State, mirror: Mirror): number => {
    let compared = 0;
    for (const { entity, archetype, row } of liveRows(reference)) {
        const index = locateHere(world.entities, entity);
        expect(index).toBeGreaterThanOrEqual(0);
        expect([world.entities.archetype[index], world.entities.row[index]]).toEqual([archetype, row]);
        const storages = reference.archetypes[archetype];
        expect(idAt(world, archetype, row)).toBe(idAt(reference, archetype, row));
        for (const key of remoteKeys) {
            const id = idOf(reference, key);
            const storage = storages.storageById[id];
            const cell = cellOf(mirror, archetype, row, id);
            if (storage === undefined) {
                expect(cell).toBeNull();
                continue;
            }
            expect(cell).toEqual({ value: readCell(storage, row), added: storage.added[row], changed: storage.changed[row] });
            // The world holds only tags of the thread's objects.
            expect(world.archetypes[archetype].storageById[id]?.values.length).toBe(0);
            compared++;
        }
    }
    return compared;
};

/** World commands for both worlds, issued the same way, through the commands systems get. */
const worldCommands = (state: State) => {
    const target = { buffer: createBuffer() };
    return { commands: createCommands(state, target), target };
};

/**
 * Random spawns, despawns, adds and removes, single and list forms, from the world's thread, which give the thread's
 * objects only their start or null; then the thread's own values for its objects, staged by the mirror, and world
 * commands after those, all applied as one sync point in both worlds.
 */
const property = (seed: number, minimum: number, steps: number): { readonly compared: number; readonly rebuilds: number } => {
    const next = random(seed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)];
    const { state: world, mirror } = threaded(minimum);
    const reference = inline();
    let nextUid = 1;
    let compared = 0;
    let dead: number[] = [];
    follow(mirror);
    for (let step = 0; step < steps; step++) {
        const before = { here: worldCommands(world), there: worldCommands(reference) };
        const after = { here: worldCommands(world), there: worldCommands(reference) };
        const thread: { here: CommandBuffer; there: CommandBuffer } = { here: createBuffer(), there: createBuffer() };
        const live = liveRows(reference).map(({ entity }) => entity);
        // Now and then one that's dead, whose commands drop.
        const someone = () => asEntity(live.length === 0 || (dead.length > 0 && next() < 0.1) ? pick(dead.length > 0 ? dead : [0]) : pick(live));
        const both = (issue: (commands: ReturnType<typeof createCommands>) => void, phase: typeof before): void => {
            issue(phase.here.commands);
            issue(phase.there.commands);
        };
        const sync = world.tick + 1;
        const operations = 1 + Math.floor(next() * 12);
        for (let o = 0; o < operations; o++) {
            const phase = next() < 0.7 ? before : after;
            const choice = next();
            const id = nextUid;
            if (choice < 0.2) {
                nextUid++;
                const form = Math.floor(next() * 4);
                const value = next() < 0.5 ? undefined : null;
                both(commands => {
                    if (form === 0) commands.spawn([uid, label])({ [uid]: id, [label]: value });
                    else if (form === 1) commands.spawn([uid, amount, label, note])({ [uid]: id, [amount]: 1, [note]: value });
                    else if (form === 2) commands.spawn([uid, flag])({ [uid]: id });
                    else commands.spawn([uid, note, own])({ [uid]: id, [own]: "o" });
                }, phase);
            }
            else if (choice < 0.3) {
                const entity = someone();
                both(commands => commands.despawn(entity), phase);
            }
            else if (choice < 0.55) {
                const entity = someone();
                const form = Math.floor(next() * 4);
                both(commands => {
                    if (form === 0) commands.add(entity, label, "none");
                    else if (form === 1) commands.add(entity, note, null);
                    else if (form === 2) commands.add(entity, [amount, label], { [amount]: 2 });
                    else commands.add(entity, [flag, note, label], { [label]: null });
                }, phase);
            }
            else if (choice < 0.75) {
                const entity = someone();
                const form = Math.floor(next() * 3);
                both(commands => {
                    if (form === 0) commands.remove(entity, label);
                    else if (form === 1) commands.remove(entity, [note, amount]);
                    else commands.remove(entity, [flag, label, note]);
                }, phase);
            }
            else {
                // The thread's own value for its object, staged there under a slot the world's command names.
                const entity = someone();
                const key = pick(remoteKeys);
                const text = `v${step}.${o}`;
                const value = key === label ? text : { text, read: () => text };
                const component = idOf(world, key);
                pushCommand(thread.here, addCommand, entity);
                pushComponent(thread.here, component, slotValue(stage(mirror, entity, component, value, sync)));
                pushCommand(thread.there, addCommand, entity);
                pushComponent(thread.there, idOf(reference, key), value);
                if (next() < 0.2) {
                    // And taken away again in the same sync point, by the thread itself.
                    pushCommand(thread.here, removeCommand, entity);
                    pushComponent(thread.here, component, undefined);
                    pushCommand(thread.there, removeCommand, entity);
                    pushComponent(thread.there, idOf(reference, key), undefined);
                }
            }
        }
        for (const [state, buffers] of [[world, [before.here.target.buffer, thread.here, after.here.target.buffer]], [reference, [before.there.target.buffer, thread.there, after.there.target.buffer]]] as const) {
            for (const buffer of buffers) state.queued.push({ buffer, guarded: true });
            synchronize(state);
        }
        dead = [...dead, ...live.filter(entity => locateHere(reference.entities, entity) < 0)].slice(-20);
        follow(mirror);
        compared += compare(reference, world, mirror);
        // Every staged slot is settled once its sync point applied.
        expect(mirror.staged.slice(mirror.head).filter(entry => entry.live)).toEqual([]);
    }
    return { compared, rebuilds: mirror.rebuilds };
};

describe("the move log", () => {
    it("gives a joined thread's columns the inline world's values and ticks after every sync point, replaying its log", () => {
        for (const seed of [1, 2, 3, 4]) {
            const { compared, rebuilds } = property(seed, 4096, 150);
            expect(compared).toBeGreaterThan(100);
            // Only the first, at the claim.
            expect(rebuilds).toBe(1);
        }
    });
    it("rebuilds to the same values and ticks once the log drops entries a thread didn't replay", () => {
        for (const seed of [5, 6, 7, 8]) {
            const { compared, rebuilds } = property(seed, 4, 150);
            expect(compared).toBeGreaterThan(100);
            expect(rebuilds).toBeGreaterThan(10);
        }
    });
    it("keeps by entity a value the thread's systems wrote, which its row's tag marks, across a rebuild and a move", () => {
        const { state, mirror } = threaded(4);
        follow(mirror);
        const { commands, target } = worldCommands(state);
        const entity = commands.spawn([uid, label])({ [uid]: 1 });
        const other = commands.spawn([uid, label])({ [uid]: 2 });
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        follow(mirror);
        // A system on the thread writes the entity's label: its value there, its tag the thread's own.
        const id = idOf(state, label);
        const index = indexOf(entity);
        const archetype = state.archetypes[state.entities.archetype[index]];
        const row = state.entities.row[index];
        const column = mirror.archetypes[archetype.id]?.byComponent[id];
        if (column === undefined) throw new Error("The mirror holds no labels.");
        column.values[row] = "written";
        const storage = archetype.storageById[id];
        if (storage === undefined) throw new Error("The world holds no labels.");
        storage.tags[row] = ownTag;
        // More entries than the log holds, and a move: the thread rebuilds, keeping the value by entity.
        const rebuilds = mirror.rebuilds;
        commands.add(entity, flag);
        for (let k = 0; k < 4; k++) commands.add(other, amount, k);
        commands.despawn(other);
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        follow(mirror);
        expect(mirror.rebuilds).toBe(rebuilds + 1);
        const moved = indexOf(entity);
        expect(cellOf(mirror, state.entities.archetype[moved], state.entities.row[moved], id)?.value).toBe("written");
    });
    it("drops a staged slot whose command names an entity the sync point despawned, without a value", () => {
        const { state, mirror } = threaded(4096);
        follow(mirror);
        const { commands, target } = worldCommands(state);
        const entity = commands.spawn([uid, label])({ [uid]: 1 });
        synchronize(state);
        commands.despawn(entity);
        const buffer = createBuffer();
        pushCommand(buffer, addCommand, entity);
        pushComponent(buffer, idOf(state, label), slotValue(stage(mirror, entity, idOf(state, label), "dropped", state.tick + 1)));
        state.queued.push({ buffer: target.buffer, guarded: true }, { buffer, guarded: true });
        synchronize(state);
        follow(mirror);
        expect(mirror.staged).toEqual([]);
    });
    it("lets an observer of the thread's objects read locations only while no sync point applies, once observers were delivered through it", async () => {
        const { state, mirror, log } = threaded(4096);
        const { commands, target } = worldCommands(state);
        const entity = commands.spawn([uid, label])({ [uid]: 1 });
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        expect(locate(mirror, entity)).toBe("behind");
        markDelivered(log);
        const first = locate(mirror, entity);
        expect(first).toEqual({ archetype: state.entities.archetype[indexOf(entity)], row: 0 });
        commands.add(entity, amount, 3);
        state.queued.push({ buffer: target.buffer, guarded: true });
        expect(prepareSync(state)).toBe(true);
        expect(new Int32Array(state.memory.memory.buffer)[structureWord] & 1).toBe(1);
        expect(locate(mirror, entity)).toBe("applying");
        let waited = false;
        const waiting = waitStructure(mirror).then(() => { waited = true; });
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(waited).toBe(false);
        applySync(state);
        await waiting;
        expect(locate(mirror, entity)).toBe("behind");
        markDelivered(log);
        const moved = locate(mirror, entity);
        expect(moved).toEqual({ archetype: state.entities.archetype[indexOf(entity)], row: 0 });
        expect(moved).not.toEqual(first);
    });
    it("keeps the counts of archetypes holding the thread's objects in the layout directory", () => {
        const { state } = threaded(4096);
        const { commands, target } = worldCommands(state);
        for (let k = 0; k < 5; k++) commands.spawn([uid, label])({ [uid]: k });
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        const archetype = state.archetypes.find(candidate => candidate.count === 5);
        if (archetype === undefined) throw new Error("No archetype holds the spawns.");
        const words = new Uint32Array(state.memory.memory.buffer);
        const record = words[words[tableOffsetWord] / 4 + archetype.id] / 4;
        expect(words[record + recordCount]).toBe(5);
        commands.despawn(asEntity(archetype.entities[0]));
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        expect(words[record + recordCount]).toBe(4);
    });
});
