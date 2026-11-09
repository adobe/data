// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Commands } from '../../interface/system/commands.js';
import { addCommand, createBuffer, despawnCommand, despawnWhereCommand, despawnWhereHolds, pushCommand, pushComponent, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
import type { Archetype } from './archetype.js';
import { reserve } from './entities.js';
import { listShapeOf, presetSpawnerOf, spawnerOf, type ListShape } from './lists.js';
import { commandIdOf, idOf, queryIdOf, storedShared, type Key, type State } from './state.js';
import { spawnTables } from './tables.js';
import { despawnMatchOf, isMatching, type DespawnMatch } from './matching.js';
import { holdsValuesOf } from './where.js';
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

const noKeys: readonly unknown[] = [];

/**
 * Queues a `despawnWhere`, its ids resolved and its `where` checked first, so a key that isn't a component, or a match
 * a component's values can't make, queues nothing.
 */
const pushDespawnWhere = (state: State, buffer: CommandBuffer, query: Parameters<Commands["despawnWhere"]>[0]): void => {
    const including: readonly unknown[] = query.with;
    const excluding: readonly unknown[] = query.not ?? noKeys;
    const { where } = query;
    if (including.length === 0) throw new Error("commands.despawnWhere's `with` names at least one component.");
    for (let k = 0; k < including.length; k++) queryIdOf(state, including[k]);
    for (let k = 0; k < excluding.length; k++) queryIdOf(state, excluding[k]);
    let match: DespawnMatch | null = null;
    const keys = where === undefined ? [] : Object.getOwnPropertySymbols(where);
    if (keys.length > 0) {
        const matched = new Map<number, unknown>();
        const shared = new Set<number>();
        /** Shared components given values of theirs, which archetypes are kept to by the numbers they're interned as. */
        const exact: { [key: symbol]: unknown } = {};
        for (const key of keys) {
            if (kindOf(key) !== "component") throw new Error(`commands.despawnWhere: where names "${labelOf(key)}", which isn't a component.`);
            const given: unknown = Reflect.get(where ?? {}, key);
            if (typeof given === "function") throw new Error(`commands.despawnWhere: where gives "${labelOf(key)}" a predicate, and takes only values and bounds.`);
            const declaration = declarationOf(key);
            if (declaration?.type !== undefined && !isMatching(declaration.type, given)) throw new Error(`commands.despawnWhere: where gives "${labelOf(key)}" ${labelOf(given)}, which none of its type's values match.`);
            const id = queryIdOf(state, key);
            matched.set(id, given);
            if (declaration?.shared === true) {
                shared.add(id);
                if (declaration.type === undefined || matchesSchema(declaration.type, given)) exact[key] = given;
            }
        }
        const exactKeys = Object.getOwnPropertySymbols(exact);
        const holds = exactKeys.length === 0 || exactKeys.length !== shared.size ? null : holdsValuesOf(state, exact, false);
        match = despawnMatchOf(matched, shared, typeof holds === "function" ? holds : null);
    }
    pushCommand(buffer, despawnWhereCommand, including.length);
    for (let k = 0; k < including.length; k++) pushComponent(buffer, queryIdOf(state, including[k]), undefined);
    for (let k = 0; k < excluding.length; k++) pushComponent(buffer, queryIdOf(state, excluding[k]), undefined);
    if (match !== null) pushComponent(buffer, despawnWhereHolds, match);
};

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
    despawnWhere: query => pushDespawnWhere(state, target.buffer, query),
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
        const updates = options?.update === true ? target.buffer : null;
        if (resources === undefined) return spawnTables(state, tables, options?.existing, updates);
        checkResources(resources);
        const spawned = spawnTables(state, tables, options?.existing, updates);
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
