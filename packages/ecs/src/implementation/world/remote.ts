// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declarationOf, labelOf, threadOfDeclaration } from '../../interface/registry/index.js';
import { makeLocal, makeRemote } from './archetype.js';
import type { CommandBuffer } from './buffer.js';
import { flushBetween } from './layout-directory.js';
import { nullTag, tagOf, type MoveLog } from './move-log.js';
import { startTicking, type State } from './state.js';

// Objects a joined thread fills: the world's storages for them hold each row's tag in place of its value, and the
// archetypes holding them append their moves to the thread's log (`move-log.ts`).

/** The logical thread a component's or resource's objects live on, or null for a struct. */
const threadOfComponent = (state: State, id: number): string | null => {
    const declaration = declarationOf(state.keys[id]);
    return declaration === undefined ? null : threadOfDeclaration(declaration);
};

/** Gives a component a joined thread fills to its log, in every archetype and batch holding it. */
const give = (state: State, id: number, log: MoveLog): void => {
    state.remote[id] = log;
    startTicking(state, [id]);
    for (const archetype of state.archetypes) {
        const storage = archetype.storageById[id];
        if (storage !== undefined) makeRemote(state.memory, archetype, storage, log);
    }
    for (const batch of state.batches) for (const column of batch.columns) if (column.id === id) column.remote = remoteError(state, id).message;
    log.announce(id);
};

/**
 * A component the world just met, whose logical thread a joined thread claims: its objects are that thread's. No
 * archetype holds it yet, so nothing allocates.
 */
export const claimComponent = (state: State, id: number): void => {
    const thread = threadOfComponent(state, id);
    const log = thread === null ? undefined : state.claims.get(thread);
    if (log === undefined) return;
    state.remote[id] = log;
    state.ticked.add(id);
    log.announce(id);
};

/**
 * Between runs: a joined thread claims logical threads, so their components' objects are its own. Rows holding them
 * start there at their starts; the world's values are released. Their ticks are kept, so the thread rebuilds them.
 */
export const claimThreads = (state: State, log: MoveLog, threads: readonly string[]): void => {
    for (const thread of threads) state.claims.set(thread, log);
    state.logs.push(log);
    state.claimed = true;
    state.counting = true;
    for (let id = 0; id < state.keys.length; id++) {
        const thread = threadOfComponent(state, id);
        if (thread !== null && state.claims.get(thread) === log) give(state, id, log);
    }
    if (state.directory !== null) state.directory.guarded = true;
    flushBetween(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
};

/**
 * Between runs: a joined thread that's gone gives back the logical threads it claimed. Rows hold the value each tag
 * names, `null` or the start: a staged value was the thread's own.
 */
export const releaseThreads = (state: State, log: MoveLog): void => {
    const index = state.logs.indexOf(log);
    if (index < 0) return;
    state.logs.splice(index, 1);
    for (const [thread, owner] of [...state.claims]) if (owner === log) state.claims.delete(thread);
    for (let id = 0; id < state.remote.length; id++) {
        if (state.remote[id] !== log) continue;
        state.remote[id] = undefined;
        for (const archetype of [...log.archetypes]) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) makeLocal(state.memory, archetype, storage, state.starts[id]);
        }
        for (const batch of state.batches) for (const column of batch.columns) if (column.id === id) column.remote = null;
    }
    state.claimed = state.logs.length > 0;
    state.counting = state.claimed || state.observer.count > 0;
    if (state.directory !== null) state.directory.guarded = state.claimed;
    // Finalizers on the threads it gave back activate again.
    state.unplacedSeen.clear();
    state.activation.met = true;
    flushBetween(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
};

export const remoteError = (state: State, id: number): Error =>
    new Error(`"${labelOf(state.keys[id])}" lives on thread "${threadOfComponent(state, id) ?? "world"}", which a joined thread fills, so a command here gives it only its start or null.`);

/**
 * For a system's commands, once a joined thread fills objects: the first error of a value another thread's object can't
 * take, with each such command dropped, by naming no entity, and each such staged spawn's value its start. Commands of
 * the joined thread whose log is `own` give its own objects slots it staged.
 */
export const checkCommands = (state: State, buffer: CommandBuffer, own: MoveLog | null = null): Error | undefined => {
    let error: Error | undefined;
    const { ids, values, starts, entities } = buffer;
    for (let command = 0; command < buffer.count; command++) {
        const end = command + 1 < buffer.count ? starts[command + 1] : buffer.named;
        for (let k = starts[command]; k < end; k++) {
            const id = ids[k];
            const log = state.remote[id];
            if (log === undefined) continue;
            const tag = tagOf(values[k], state.starts[id]);
            if (tag >= 0 && (tag <= nullTag || log === own)) continue;
            error ??= remoteError(state, id);
            entities[command] = 0;
            break;
        }
    }
    for (let s = 0; s < buffer.stagedCount; s++) {
        const { batch, start, end } = buffer.staged[s];
        for (const column of batch.columns) {
            const log = state.remote[column.id];
            if (log === undefined) continue;
            const begin = state.starts[column.id];
            for (let row = start; row < end; row++) {
                const tag = tagOf(column.values[row], begin);
                if (tag >= 0 && (tag <= nullTag || log === own)) continue;
                error ??= remoteError(state, column.id);
                column.values[row] = begin;
            }
        }
    }
    return error;
};
