import type { Commands } from '../../system/commands.js';
import { addCommand, despawnCommand, pushCommand, pushComponent, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { hasSymbolNames } from '../../registry/create-registry.js';
import { stageSpawn } from './batches.js';
import { reserve } from './entities.js';
import { idOf, type Key, type State } from './state.js';

const collect = (state: State, buffer: CommandBuffer, key: Key, value: unknown): void => {
    if (value !== undefined) pushComponent(buffer, idOf(state, key), value);
};

/**
 * Appends a command naming each own key of `values` that isn't `undefined`. Ids are resolved first, so an unregistered
 * component throws before anything is appended. Values are immutable by convention, so they aren't copied.
 */
export const pushValues = (state: State, buffer: CommandBuffer, kind: number, entity: number, values: object): void => {
    const { count, named } = buffer;
    pushCommand(buffer, kind, entity);
    try {
        // `Object.keys` uses the engine's cached key list; symbol keys are read only when a symbol name exists.
        for (const key of Object.keys(values)) collect(state, buffer, key, Reflect.get(values, key));
        if (hasSymbolNames()) for (const key of Object.getOwnPropertySymbols(values)) collect(state, buffer, key, Reflect.get(values, key));
    }
    catch (error) {
        // An unregistered component: the command is dropped whole.
        buffer.count = count;
        buffer.named = named;
        throw error;
    }
};

/** Commands that queue for the next sync point. Unregistered components throw here, inside the issuing system. */
export const createCommands = (state: State, target: { readonly buffer: CommandBuffer }): Commands => ({
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
        const ids = components.map((key: Key) => idOf(state, key));
        pushCommand(target.buffer, removeCommand, entity);
        for (const id of ids) pushComponent(target.buffer, id, undefined);
    },
});
