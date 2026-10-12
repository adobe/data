import type { Commands } from '../../system/commands.js';
import type { Entity } from '../../entity/entity.js';
import { claim, openRow, spawnShapeOf, type Shape, type SpawnBatch, type Writer } from './batches.js';
import { spawnCommand } from './buffer.js';
import { commandsTarget, pushValues, type CommandsTarget } from './commands.js';
import { reserve } from './entities.js';
import type { Key, State } from './state.js';

type TargetedCommands = Commands & { readonly [commandsTarget]: CommandsTarget };

const isTargeted = (commands: Commands): commands is TargetedCommands => commandsTarget in commands;

/** The spawn `commands.spawn` would make of these keys and values, for spawns that can't be staged. */
const valuesOf = (keys: readonly Key[], values: readonly unknown[]): { [key: string | symbol]: unknown } => {
    const object: { [key: string | symbol]: unknown } = {};
    keys.forEach((key, k) => { object[key] = values[k]; });
    return object;
};

/**
 * One spawn site's staging, for code the compiler emits per site with one parameter per value: `begin(commands)`
 * returns the row to write, or -1 when the spawn must go through `fallback`; then `writers[k](row, value)` writes
 * value `k`, returning false at an `undefined`; `end()` claims the row and returns its entity. Each site calls its own
 * writers, so each call stays specialized to one column's layout.
 */
export type PreparedSpawn = {
    readonly begin: (commands: Commands) => number;
    writers: readonly Writer[];
    readonly end: () => Entity;
    readonly fallback: (commands: Commands, values: readonly unknown[]) => Entity;
};

/**
 * The compiler's hook for `commands.spawn({ ... })` with literal keys in a system body: the call becomes a per-site
 * function taking the values in key order, so no value object is built. `keys` is called on first use, after the
 * module's key constants are initialized. Spawns the batch can't take, and commands it didn't make, go through
 * `commands.spawn` as written.
 */
export const prepareSpawn = (keys: () => readonly Key[]): PreparedSpawn => {
    let resolved: readonly Key[] | null = null;
    /** A key named twice means the later value wins, as in the object literal; the batch can't hold that. */
    let distinct = false;
    let last: State | null = null;
    let shape: Shape | null = null;
    let batch: SpawnBatch | null = null;
    const prepared: PreparedSpawn = {
        writers: [],
        begin: commands => {
            if (resolved === null) {
                resolved = keys();
                distinct = new Set(resolved).size === resolved.length;
            }
            if (!distinct || !isTargeted(commands)) return -1;
            const { state } = commands[commandsTarget];
            if (state !== last || shape === null) {
                shape = spawnShapeOf(state, resolved);
                last = state;
                prepared.writers = shape.writers;
            }
            batch = shape.batch;
            return batch === null ? -1 : openRow(batch);
        },
        end: () => {
            const entity = last === null ? -1 : reserve(last.entities);
            if (batch !== null) claim(batch, entity);
            return entity;
        },
        fallback: (commands, values) => {
            const object = valuesOf(resolved ?? keys(), values);
            if (!isTargeted(commands)) return commands.spawn(object);
            const { state, target } = commands[commandsTarget];
            const entity = reserve(state.entities);
            pushValues(state, target.buffer, spawnCommand, entity, object);
            return entity;
        },
    };
    return prepared;
};
