import type { Commands } from '../../interface/system/commands.js';
import type { Essential } from '../../interface/component/value.js';
import type { Entity } from '../../interface/entity/entity.js';
import { addCommand, pushCommand, pushComponent, type CommandBuffer } from './buffer.js';
import { commandsTarget, type CommandsTarget } from './commands.js';
import { listShapeOf, positionalOf, type ListShape, type Positional } from './lists.js';
import type { Key, State } from './state.js';
import { archetypeIndexOf } from '../../interface/registry/index.js';

type TargetedCommands = Commands & { readonly [commandsTarget]: CommandsTarget };

const isTargeted = (commands: Commands): commands is TargetedCommands => commandsTarget in commands;

/** The values object a site would have built, for calls the site can't take positionally. */
const valuesOf = (keys: readonly Key[], values: readonly unknown[]): { [key: string | symbol]: unknown } => {
    const object: { [key: string | symbol]: unknown } = {};
    keys.forEach((key, k) => { object[key] = values[k]; });
    return object;
};

/** What a site resolved for a world and shape. */
type Planned = { readonly state: State; readonly shape: ListShape };

/** A site's plans: by archetype index, for the world that last used it, and by shape, which belongs to one world and is held only while it lives. */
type Plans<P> = { readonly byIndex: (P | undefined)[]; readonly byShape: WeakMap<ListShape, P> };

const createPlans = <P>(): Plans<P> => ({ byIndex: [], byShape: new WeakMap() });

/** A site's plan for a world and list: a kept one, else one `make` makes for its shape, kept from then on. */
const planFor = <P extends Planned>(plans: Plans<P>, state: State, list: readonly unknown[], make: (shape: ListShape) => P): P => {
    const index = archetypeIndexOf(list);
    if (index >= 0) {
        const indexed = plans.byIndex[index];
        if (indexed !== undefined && indexed.state === state) return indexed;
    }
    const shape = listShapeOf(state, list);
    let plan = plans.byShape.get(shape);
    if (plan === undefined) {
        plan = make(shape);
        plans.byShape.set(shape, plan);
    }
    if (index >= 0) plans.byIndex[index] = plan;
    return plan;
};

/** What a spawn site resolved for a world and list: the spawns of its shape taking the site's values in its key order. */
type SpawnPlan = Planned & { readonly spawn: Positional };

/**
 * One spawn site's staging, for code the compiler emits for `commands.spawn(components)({ ... })` with literal keys:
 * `begin(commands, components)` returns the function spawning with the site's values in its key order, generated for
 * the shape so its stores are specialized, or null when the spawn must go through `fallback`.
 */
export type PreparedSpawn = {
    readonly begin: (commands: Commands, components: readonly Essential[]) => Positional | null;
    readonly fallback: (commands: Commands, components: readonly Essential[], values: readonly unknown[]) => Entity;
};

/**
 * The compiler's hook for a main-thread spawn site with literal keys: the call becomes a per-site function taking the
 * values in key order, so no value object is built and nothing is read by key. `keys` is called on first use, after
 * the module's key constants are initialized. Commands it didn't make go through `commands.spawn` as written.
 */
export const prepareSpawn = (keys: () => readonly Key[]): PreparedSpawn => {
    let resolved: readonly Key[] | null = null;
    /** A key named twice means the later value wins, as in the object literal: such sites use `commands.spawn`. */
    let distinct = false;
    const plans = createPlans<SpawnPlan>();
    return {
        begin: (commands, components) => {
            if (resolved === null) {
                resolved = keys();
                distinct = new Set(resolved).size === resolved.length;
            }
            if (!distinct || !isTargeted(commands)) return null;
            const { state } = commands[commandsTarget];
            const site = resolved;
            return planFor(plans, state, components, shape => ({ state, shape, spawn: positionalOf(state, shape, site) })).spawn;
        },
        // Commands this world didn't make, or keys named twice, which only an untyped values object can carry.
        fallback: (commands, components, values) => Reflect.apply(commands.spawn(components), undefined, [valuesOf(resolved ?? keys(), values)]),
    };
};

/**
 * What an add site resolved for a world and list: its values' component ids, -1 for one the list doesn't name, with
 * their starts, and the list's other components with theirs.
 */
type AddPlan = Planned & { readonly ids: readonly number[]; readonly given: readonly unknown[]; readonly missing: readonly number[]; readonly starts: readonly unknown[] };

/**
 * One add site's command, for code the compiler emits for `commands.add(entity, components, { ... })` with literal
 * keys: `begin(commands, entity, components)` appends the add command and returns true, or false when the add must go
 * through `fallback`; then `value(k, value)` appends value `k`, `undefined` as its start; `end()` appends the starts of
 * the components the site gives no value.
 */
export type PreparedAdd = {
    readonly begin: (commands: Commands, entity: Entity, components: readonly Essential[]) => boolean;
    readonly value: (k: number, value: unknown) => void;
    readonly end: () => void;
    readonly fallback: (commands: Commands, entity: Entity, components: readonly Essential[], values: readonly unknown[]) => void;
};

/**
 * The compiler's hook for a main-thread add site with literal keys: the call becomes a per-site function taking the
 * entity and values in key order, so no value object is built and nothing is read by key. Ids are resolved once per
 * world and list, so a key that isn't a component commands may add throws before anything is appended, as
 * `commands.add` does. Commands it didn't make go through `commands.add` as written.
 */
export const prepareAdd = (keys: () => readonly Key[]): PreparedAdd => {
    let resolved: readonly Key[] | null = null;
    let distinct = false;
    const plans = createPlans<AddPlan>();
    let plan: AddPlan | null = null;
    let buffer: CommandBuffer | null = null;
    return {
        begin: (commands, entity, components) => {
            if (resolved === null) {
                resolved = keys();
                distinct = new Set(resolved).size === resolved.length;
            }
            if (!distinct || !isTargeted(commands)) return false;
            const { state, target } = commands[commandsTarget];
            const site = resolved;
            plan = planFor(plans, state, components, shape => {
                const named = shape.keys.flatMap((key, k) => site.includes(key) ? [] : [k]);
                const at = site.map(key => typeof key === "symbol" ? shape.keys.indexOf(key) : -1);
                return {
                    state,
                    shape,
                    ids: at.map(k => k < 0 ? -1 : shape.ids[k]),
                    given: at.map(k => k < 0 ? undefined : shape.starts[k]),
                    missing: named.map(k => shape.ids[k]),
                    starts: named.map(k => shape.starts[k]),
                };
            });
            buffer = target.buffer;
            pushCommand(buffer, addCommand, entity);
            buffer.shapes[buffer.count - 1] = plan.shape.index;
            return true;
        },
        value: (k, value) => {
            const id = plan === null ? -1 : plan.ids[k];
            if (buffer === null || plan === null || id < 0) return;
            pushComponent(buffer, id, value === undefined ? plan.given[k] : value);
        },
        end: () => {
            if (buffer === null || plan === null) return;
            const { missing, starts } = plan;
            for (let k = 0; k < missing.length; k++) pushComponent(buffer, missing[k], starts[k]);
        },
        fallback: (commands, entity, components, values) => Reflect.apply(commands.add, commands, [entity, components, valuesOf(resolved ?? keys(), values)]),
    };
};
