import type { Component } from "../../interface/component/component.js";
import type { Components } from "../../interface/component/types.js";
import type { ReadonlyValue } from "../../interface/component/value.js";
import type { Entity } from "../../interface/entity/entity.js";
import { toPromise as builtInToPromise } from "../../interface/observe/to-promise.js";
import type { Resource } from "../../interface/resource/resource.js";
import type { ReadonlyValue as ReadonlyResourceValue } from "../../interface/resource/value.js";
import { System } from "../../interface/system/system.js";
import type { Query } from "../../interface/world/query.js";
import type { World } from "../../interface/world/world.js";
import { Observe } from "../../observe/index.js";

// Observers through either implementation, so one suite of cases checks both: the world's own (`world.observe`)
// and the internal factories of `src/observe`, built on synced systems.

type Observer<T> = (notify: (value: T) => void) => () => void;

export type Adapter = {
    readonly name: "built-in" | "factory";
    readonly resource: <R extends Resource.Key>(world: World, key: R) => Observer<ReadonlyResourceValue<R>>;
    readonly entity: <const R extends readonly Component.Key[] = [], const O extends readonly Component.Key[] = []>(world: World, entity: Entity, components: { readonly required?: R; readonly optional?: O }) =>
        Observer<({ readonly [K in keyof Pick<Components, R[number]>]: ReadonlyValue<K> } & { readonly [K in keyof Pick<Components, O[number]>]?: ReadonlyValue<K> }) | null>;
    readonly select: <const R extends readonly Component.Key[] = []>(world: World, query: Query<R>) => Observer<readonly Entity[]>;
    readonly count: <const R extends readonly Component.Key[] = []>(world: World, query: Omit<Query<R>, "order" | "page">) => Observer<number>;
    readonly toPromise: <T>(observe: Observer<T>) => Promise<T>;
};

export const builtIn: Adapter = {
    name: "built-in",
    resource: (world, key) => world.observe.resource(key),
    entity: (world, entity, components) => world.observe.entity(entity, components),
    select: (world, query) => world.observe.select(query),
    count: (world, query) => world.observe.count(query),
    toPromise: builtInToPromise,
};

export const factory: Adapter = {
    name: "factory",
    resource: Observe.resource,
    entity: Observe.entity,
    select: Observe.select,
    count: Observe.count,
    toPromise: Observe.toPromise,
};

export const adapters: readonly Adapter[] = [builtIn, factory];

const settled = System.create({ name: "observeAdapters/settled", synced: true }, () => {});

/**
 * Resolves once every observer subscribed before it had its first value: after the factories' flush, which the end of
 * this task starts, and a run queued after the runs it makes. For either implementation, it's a run that changes nothing.
 */
export const settle = async (world: World): Promise<void> => {
    await Promise.resolve();
    await world.run(settled);
};

/**
 * What the factories do differently from the world's own observers, by design: a case that expects either names its
 * entry, through `byDesign`.
 */
export const differences = {
    "cold first value": "A first value the factories don't hold yet comes asynchronously, from a run after every run called before the subscribing call (read-your-writes); one they hold, synchronously.",
    "cold first throw": "A notify that throws on a first value given asynchronously is an uncaught error, as a joined thread's are, rather than a failure of the next run.",
    "entity order": "Selections without `order`, and ties under one, come in entity order rather than storage order.",
    "system failures": "A notify that throws on a later value is a `\"system\"` failure named by the factory system's label, rather than an `\"observer\"` failure named by what it observes.",
    "whole entity": "An entity observer lists the components it reads: there's no form without them.",
    "disposed": "A disposed world runs nothing, so a first value the factories don't hold never comes.",
    "objects throw at subscribe": "On a joined thread, an observer reading objects it can't throws when subscribed, as the factories make nothing before, rather than when made.",
} as const;

/** Whether an adapter's expectations differ by design in what `difference` names: the factory's, in `differences`. */
export const byDesign = (adapter: Adapter, difference: keyof typeof differences): boolean => adapter.name === "factory" && differences[difference] !== undefined;
