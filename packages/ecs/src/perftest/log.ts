// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createBuffer } from "../implementation/world/buffer.js";
import { createCommands } from "../implementation/world/commands.js";
import { asEntity } from "../implementation/world/entities.js";
import { cellOf, createMirror, nameComponent, rebuild, replay, type Mirror } from "../implementation/world/mirror.js";
import { createMoveLog } from "../implementation/world/move-log.js";
import { claimThreads } from "../implementation/world/remote.js";
import { createState, defaultOf, idOf, type State } from "../implementation/world/state.js";
import { synchronize } from "../implementation/world/synchronize.js";
import type { Benchmark } from "./benchmark.js";

// A joined thread's object columns following the world's rows: replaying the move log, and rebuilding from the layout
// directory once it lapped. The world and the thread's mirror are on this thread, the mirror timed alone.

const serial = Symbol("log/serial");
const label = Symbol("log/label");
const moved = Symbol("log/moved");
declare module "@adobe/ecs" {
    export interface Threads {
        logBenchmark: true;
    }
    export interface Components {
        [serial]: { type: number };
        [label]: { type: { readonly text: string } | null; thread: "logBenchmark"; default: typeof none };
        [moved]: { type: true };
    }
}
const none = { text: "none" };

/** Entities moved, and swapped out of the rows they leave, per sync point of `log replay`. */
export const replayMoves = 10_000;
/** Rows `log rebuild 100K` rebuilds. */
export const rebuildRows = 100_000;

/** A world whose "logBenchmark" objects a mirror on this thread fills, with `count` entities holding one each. */
const joinedWorld = (count: number): { readonly state: State; readonly mirror: Mirror; readonly entities: readonly number[] } => {
    const state = createState(true);
    let mirror: Mirror | null = null;
    const log = createMoveLog(state.memory, 1, state.starts, component => {
        const key = state.keys[component];
        if (mirror !== null && typeof key === "symbol") nameComponent(mirror, component, key, defaultOf);
    });
    mirror = createMirror(state.memory.memory, log.block, 1);
    for (const key of [serial, label, moved]) idOf(state, key);
    claimThreads(state, log, ["logBenchmark"]);
    const target = { buffer: createBuffer() };
    const commands = createCommands(state, target);
    const entities: number[] = [];
    for (let k = 0; k < count; k++) entities.push(commands.spawn([serial, label])({ [serial]: k }));
    synchronize(state);
    if (!rebuild(mirror)) throw new Error("log: the mirror didn't rebuild.");
    return { state, mirror, entities };
};

/**
 * The fastest of `rounds` replays of a sync point moving `replayMoves` of 20K entities to another archetype holding the
 * thread's objects, and back the next, each move leaving a row the archetype's last swaps into.
 */
const logReplay = async (rounds = 40): Promise<number> => {
    const { state, mirror, entities } = joinedWorld(2 * replayMoves);
    const target = { buffer: createBuffer() };
    const commands = createCommands(state, target);
    let best = Infinity;
    for (let round = 0; round < rounds; round++) {
        for (let k = 0; k < replayMoves; k++) {
            // Every other one, so the rows they leave are spread over the archetype.
            const entity = asEntity(entities[2 * k]);
            if (round % 2 === 0) commands.add(entity, moved);
            else commands.remove(entity, moved);
        }
        state.queued.push({ buffer: target.buffer, guarded: true });
        synchronize(state);
        const start = performance.now();
        const replayed = replay(mirror);
        const time = performance.now() - start;
        // The first sync point with the rows in place grows the ring to hold them, which a thread rebuilds after.
        if (replayed === "lapped" && round === 0 && rebuild(mirror)) continue;
        if (replayed !== "current") throw new Error(`log replay: the mirror's replay was ${replayed}.`);
        if (round > 1) best = Math.min(best, time);
        await Promise.resolve();
    }
    const last = state.archetypes.find(archetype => archetype.count === replayMoves * 2);
    if (last === undefined || cellOf(mirror, last.id, 0, idOf(state, label))?.value !== none) throw new Error("log replay: the mirror doesn't hold the rows' objects.");
    return best;
};

/** The fastest of `rounds` rebuilds of `rebuildRows` rows from the layout directory, as after the log lapped. */
const logRebuild = async (rounds = 20): Promise<number> => {
    const { state, mirror } = joinedWorld(rebuildRows);
    let best = Infinity;
    for (let round = 0; round < rounds; round++) {
        const start = performance.now();
        const rebuilt = rebuild(mirror);
        const time = performance.now() - start;
        if (!rebuilt) throw new Error("log rebuild: the mirror didn't rebuild.");
        if (round > 1) best = Math.min(best, time);
        await Promise.resolve();
    }
    const archetype = state.archetypes.find(candidate => candidate.count === rebuildRows);
    if (archetype === undefined || cellOf(mirror, archetype.id, rebuildRows - 1, idOf(state, label))?.value !== none) throw new Error("log rebuild: the mirror doesn't hold the rows' objects.");
    return best;
};

export const logBenchmarks: readonly Benchmark[] = [
    {
        name: "log replay",
        operation: "A joined thread replaying a sync point's move log: 10K entities holding its objects moving archetype, each leaving a row the last swaps into, as when a tag on DOM-backed entities toggles.",
        per: "moves",
        n: replayMoves,
        typical: [1, 10_000],
        best: { bytes: 128, basis: "Each move copies out and reads two 16-byte entries, and copies its object, ticks and entity twice, 32 bytes read and written each." },
        run: () => logReplay(),
    },
    {
        name: "log rebuild 100K",
        operation: "A joined thread rebuilding its object columns over 100K rows from the layout directory, as when it fell further behind than its log holds.",
        per: "rows",
        n: rebuildRows,
        typical: [1_000, 100_000],
        best: { bytes: 60, basis: "Each row reads its 8-byte entity, 4-byte tag and 16 bytes of ticks, and writes its entity, object and ticks." },
        run: () => logRebuild(),
    },
];
