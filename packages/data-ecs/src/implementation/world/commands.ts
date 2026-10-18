import type { Commands } from '../../interface/system/commands.js';
import { addCommand, despawnCommand, pushCommand, pushComponent, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { stageSpawn } from './batches.js';
import { reserve } from './entities.js';
import { commandIdOf, type Key, type State } from './state.js';

/** Where a world's commands queue: on the commands object under a symbol, so prepared spawns find it in one read. */
export const commandsTarget = Symbol("commandsTarget");

export type CommandsTarget = { readonly state: State; readonly target: { readonly buffer: CommandBuffer } };

const collect = (state: State, buffer: CommandBuffer, key: Key, value: unknown): void => {
    if (value !== undefined) pushComponent(buffer, commandIdOf(state, key), value);
};

/**
 * Appends a command naming each own symbol key of `values` whose value isn't `undefined`; string keys are never a
 * component's, so they're ignored. Ids are resolved first, so an unregistered component throws before anything is
 * appended. Values are immutable by convention, so they aren't copied.
 */
export const pushValues = (state: State, buffer: CommandBuffer, kind: number, entity: number, values: object): void => {
    const { count, named } = buffer;
    pushCommand(buffer, kind, entity);
    try {
        // The fastest way to list symbol keys (`perftest/keys.ts`).
        const keys = Object.getOwnPropertySymbols(values);
        for (let k = 0; k < keys.length; k++) collect(state, buffer, keys[k], Reflect.get(values, keys[k]));
    }
    catch (error) {
        // An unregistered component: the command is dropped whole.
        buffer.count = count;
        buffer.named = named;
        throw error;
    }
};

/** Commands that queue for the next sync point. Unregistered components throw here, inside the issuing system. */
export const createCommands = (state: State, target: { readonly buffer: CommandBuffer }): Commands & { readonly [commandsTarget]: CommandsTarget } => ({
    [commandsTarget]: { state, target },
    spawn: values => {
        const entity = reserve(state.entities);
        if (!stageSpawn(state, entity, values)) pushValues(state, target.buffer, spawnCommand, entity, values);
        return entity;
    },
    despawn: entity => {
        pushCommand(target.buffer, despawnCommand, entity);
    },
    add: (entity, values) => {
        pushValues(state, target.buffer, addCommand, entity, values);
    },
    remove: (entity, ...components) => {
        const ids = components.map((key: Key) => commandIdOf(state, key));
        pushCommand(target.buffer, removeCommand, entity);
        for (const id of ids) pushComponent(target.buffer, id, undefined);
    },
});
