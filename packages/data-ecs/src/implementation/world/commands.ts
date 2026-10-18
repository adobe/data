import type { Commands } from '../../interface/system/commands.js';
import { addCommand, despawnCommand, pushCommand, pushComponent, removeCommand, type CommandBuffer } from './buffer.js';
import { listShapeOf, spawnerOf } from './lists.js';
import { commandIdOf, idOf, type Key, type State } from './state.js';

const collect = (state: State, buffer: CommandBuffer, key: Key, value: unknown): void => {
    if (value !== undefined) pushComponent(buffer, idOf(state, key), value);
};

/**
 * Appends a command naming each own symbol key of `values` whose value isn't `undefined`, for the world's own changes
 * to the resource entity. Ids are resolved first, so an unregistered key throws before anything is appended.
 */
export const pushValues = (state: State, buffer: CommandBuffer, kind: number, entity: number, values: object): void => {
    const { count, named } = buffer;
    pushCommand(buffer, kind, entity);
    try {
        const keys = Object.getOwnPropertySymbols(values);
        for (let k = 0; k < keys.length; k++) collect(state, buffer, keys[k], Reflect.get(values, keys[k]));
    }
    catch (error) {
        buffer.count = count;
        buffer.named = named;
        throw error;
    }
};

/** Where a world's commands queue: on the commands object under a symbol, so prepared sites find it in one read. */
export const commandsTarget = Symbol("commandsTarget");

export type CommandsTarget = { readonly state: State; readonly target: { readonly buffer: CommandBuffer } };

/** Values of a list add given none, which only an untyped caller does. */
const empty = {};

/**
 * Commands that queue for the next sync point. A key that isn't a component commands may name throws here, inside the
 * issuing system, before anything is queued. Values are immutable by convention, so they aren't copied.
 */
export const createCommands = (state: State, target: { readonly buffer: CommandBuffer }): Commands & { readonly [commandsTarget]: CommandsTarget } => ({
    [commandsTarget]: { state, target },
    spawn: components => spawnerOf(state, listShapeOf(state, components)),
    despawn: entity => {
        pushCommand(target.buffer, despawnCommand, entity);
    },
    add: (entity: number, components: symbol | readonly symbol[], values?: unknown) => {
        const { buffer } = target;
        if (typeof components === "symbol") {
            const id = commandIdOf(state, components);
            pushCommand(buffer, addCommand, entity);
            pushComponent(buffer, id, values === undefined ? state.starts[id] : values);
            return;
        }
        const shape = listShapeOf(state, components);
        const { keys, ids, starts } = shape;
        const given = typeof values === "object" && values !== null ? values : empty;
        pushCommand(buffer, addCommand, entity);
        buffer.shapes[buffer.count - 1] = shape.index;
        for (let k = 0; k < keys.length; k++) {
            const value: unknown = Reflect.get(given, keys[k]);
            pushComponent(buffer, ids[k], value === undefined ? starts[k] : value);
        }
    },
    remove: (entity: number, components: symbol | readonly symbol[]) => {
        const { buffer } = target;
        if (typeof components === "symbol") {
            const id = commandIdOf(state, components);
            pushCommand(buffer, removeCommand, entity);
            pushComponent(buffer, id, undefined);
            return;
        }
        const shape = listShapeOf(state, components);
        const { ids } = shape;
        pushCommand(buffer, removeCommand, entity);
        buffer.shapes[buffer.count - 1] = shape.index;
        for (let k = 0; k < ids.length; k++) pushComponent(buffer, ids[k], undefined);
    },
});
