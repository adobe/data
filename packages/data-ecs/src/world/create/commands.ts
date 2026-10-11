import type { Commands } from '../../system/commands.js';
import { addCommand, despawnCommand, pushCommand, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { hasSymbolNames } from '../../registry/create-registry.js';
import { reserve } from './entities.js';
import { idOf, type Key, type State } from './state.js';

/** Reused between commands: the ids and values being issued. */
const scratchIds: number[] = [];
const scratchValues: unknown[] = [];

const collect = (state: State, key: Key, value: unknown): void => {
    if (value === undefined) return;
    scratchIds.push(idOf(state, key));
    scratchValues.push(value);
};

/**
 * Appends a command naming each own key of `values` that isn't `undefined`. Ids are resolved first, so an unregistered
 * component throws before anything is appended. Values are immutable by convention, so they aren't copied.
 */
export const pushValues = (state: State, buffer: CommandBuffer, kind: number, entity: number, values: object): void => {
    scratchIds.length = 0;
    scratchValues.length = 0;
    // `for...in` uses the engine's enumeration cache; symbol keys are read only when a symbol name exists.
    for (const key in values) collect(state, key, Reflect.get(values, key));
    if (hasSymbolNames()) for (const key of Object.getOwnPropertySymbols(values)) collect(state, key, Reflect.get(values, key));
    pushCommand(buffer, kind, entity);
    for (let i = 0; i < scratchIds.length; i++) {
        buffer.ids.push(scratchIds[i]);
        buffer.values.push(scratchValues[i]);
    }
};

/** Commands that queue for the next sync point. Unregistered components throw here, inside the issuing system. */
export const createCommands = (state: State, target: { readonly buffer: CommandBuffer }): Commands => ({
    spawn: values => {
        const entity = reserve(state.entities);
        pushValues(state, target.buffer, spawnCommand, entity, values);
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
        for (const id of ids) target.buffer.ids.push(id);
        for (let i = 0; i < ids.length; i++) target.buffer.values.push(undefined);
    },
});
