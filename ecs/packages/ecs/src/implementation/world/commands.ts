// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Commands } from '../../interface/system/commands.js';
import { addCommand, createBuffer, despawnCommand, pushCommand, pushComponent, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import { reserve } from './entities.js';
import { listShapeOf, presetSpawnerOf, spawnerOf, type ListShape } from './lists.js';
import { commandIdOf, idOf, storedShared, type Key, type State } from './state.js';
import { spawnTables } from './tables.js';
import { declarationOf, isWorldWritten, kindOf, labelOf, threadOfDeclaration, whyUnregistered } from '../../interface/registry/index.js';
import { matchesSchema } from '../../interface/registry/schemas.js';

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

/** A list add naming shared components: each value checked and interned first, so one not of its type queues nothing. */
const addShared = (state: State, buffer: CommandBuffer, entity: number, shape: ListShape, given: object): void => {
    const { keys, ids, starts } = shape;
    const values = keys.map((key, k) => {
        const value: unknown = Reflect.get(given, key);
        const start = value === undefined ? starts[k] : value;
        return state.shared[ids[k]] === undefined ? start : storedShared(state, ids[k], start);
    });
    pushCommand(buffer, addCommand, entity);
    buffer.shapes[buffer.count - 1] = shape.index;
    for (let k = 0; k < keys.length; k++) pushComponent(buffer, ids[k], values[k]);
};

/**
 * Throws for a key of `resources` that isn't a resource, is one only the world writes or one living on another thread,
 * or is given a value its schema doesn't take.
 */
const checkResources = (resources: object): void => {
    for (const key of Object.getOwnPropertySymbols(resources)) {
        const fail = (message: string): never => { throw new Error(`commands.spawnTables: "${labelOf(key)}" ${message}.`); };
        if (kindOf(key) !== "resource") fail(`isn't a registered resource: ${whyUnregistered(key)}`);
        if (isWorldWritten(key)) fail("is written only by the world");
        const declaration = declarationOf(key);
        if (declaration === undefined) continue;
        const thread = threadOfDeclaration(declaration);
        if (thread !== null && thread !== "world") fail(`lives on thread "${thread}", not the world's`);
        if (declaration.type !== undefined && !matchesSchema(declaration.type, Reflect.get(resources, key))) fail("is given a value its type doesn't take");
    }
};

/**
 * Queues `resources`' values for the sync point as the world's own change to its resource entity, which it reserves
 * when the world has none yet: a buffer of their own, since the sync point skips systems' commands to that entity.
 */
const queueResources = (state: State, resources: object): void => {
    if (Object.getOwnPropertySymbols(resources).length === 0) return;
    const buffer = createBuffer();
    if (state.resourceEntity < 0) {
        state.resourceEntity = reserve(state.entities);
        pushValues(state, buffer, spawnCommand, state.resourceEntity, resources);
    }
    else pushValues(state, buffer, addCommand, state.resourceEntity, resources);
    state.queued.push({ buffer, guarded: false });
};

/** Values of a list add given none, which only an untyped caller does. */
const empty = {};

/**
 * Commands that queue for the next sync point. A key that isn't a component commands may name throws here, inside the
 * issuing system, before anything is queued. Values are immutable by convention, so they aren't copied.
 */
export const createCommands = (state: State, target: { readonly buffer: CommandBuffer }): Commands & { readonly [commandsTarget]: CommandsTarget } => ({
    [commandsTarget]: { state, target },
    // A second parameter rather than a rest one, which would allocate an array each call.
    spawn: (components: readonly symbol[], preset?: unknown) => {
        const shape = listShapeOf(state, components);
        return typeof preset === "object" && preset !== null ? presetSpawnerOf(state, shape, preset) : spawnerOf(state, shape);
    },
    despawn: entity => {
        pushCommand(target.buffer, despawnCommand, entity);
    },
    add: (entity: number, components: symbol | readonly symbol[], values?: unknown) => {
        const { buffer } = target;
        if (typeof components === "symbol") {
            const id = commandIdOf(state, components);
            const value = values === undefined ? state.starts[id] : values;
            // A shared value chooses the archetype: one not of its type fails this system, queuing nothing.
            const stored = state.shared[id] === undefined ? value : storedShared(state, id, value);
            pushCommand(buffer, addCommand, entity);
            pushComponent(buffer, id, stored);
            return;
        }
        const shape = listShapeOf(state, components);
        const { keys, ids, starts } = shape;
        const given = typeof values === "object" && values !== null ? values : empty;
        if (shape.shared.length > 0) return addShared(state, buffer, entity, shape, given);
        pushCommand(buffer, addCommand, entity);
        buffer.shapes[buffer.count - 1] = shape.index;
        for (let k = 0; k < keys.length; k++) {
            const value: unknown = Reflect.get(given, keys[k]);
            pushComponent(buffer, ids[k], value === undefined ? starts[k] : value);
        }
    },
    spawnTables: (tables, options) => {
        const resources = options?.resources;
        if (resources === undefined) return spawnTables(state, tables, options?.existing);
        checkResources(resources);
        const spawned = spawnTables(state, tables, options?.existing);
        queueResources(state, resources);
        return spawned;
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
