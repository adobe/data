// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Essential, Shared } from '../component/value.js';
import type { Table } from '../world/table/table.js';
import type { ValuesOf } from './values-of.js';

/** The value an `add` of one component takes: none for a tag. */
type ValueArgument<K extends Essential> = Component<K> extends true ? [value?: true] : [value: Component<K>];

/** Values of components of `C` a spawner's first call may give, constant for every entity it spawns. */
type Preset<C extends readonly Essential[]> = { readonly [K in C[number]]?: Component<K> };

/** The value of each shared component of `C`, which a spawner's first call must give, since they choose the archetype. */
type SharedPreset<C extends readonly Essential[]> = { readonly [K in C[number] & Shared]: Component<K> };

/**
 * Whether `C` names a shared component, so a spawner of it takes its constants: a list that isn't a tuple, whose
 * components aren't known until it runs, may take them or not.
 */
type RequiresPreset<C extends readonly Essential[]> = number extends C["length"] ? false : [C[number] & Shared] extends [never] ? false : true;

/** A preset naming only components of `C`: any other key's value is a message naming it. Written in place, so keys print. */
type Named<C extends readonly Essential[], P> = { readonly [K in Exclude<keyof P, C[number]>]: { readonly "error: a constant names a component of the spawn's list": { readonly [Q in K]: "isn't one" } } };

/**
 * The list of a spawn, which, when it names a shared component and no constants are given, is a message naming them:
 * the spawn takes their values first.
 */
type Spawned<C extends readonly Essential[], P> = RequiresPreset<C> extends true
    ? [keyof P] extends [never] ? C & { readonly "error: a spawn of a shared component takes its value first, in its constants": { readonly [K in C[number] & Shared]: Component<K> } } : C
    : C;

/** Each component of `C` the constants `P` gave, whose value a spawn's values give again as a message naming it. */
type Again<C extends readonly Essential[], P> = { readonly [K in keyof P & C[number]]?: { readonly "error: a spawn gives each component's value in one of its calls, this one in its constants": { readonly [Q in K]: "given" } } };

/**
 * What a spawner with constants `P` of the components `C` takes: the rest of each entity's values, exactly, or nothing
 * once none of them is required.
 */
type SpawnValues<C extends readonly Essential[], P> = number extends C["length"]
    ? [values: ValuesOf<C, keyof P>]
    : {} extends ValuesOf<C, keyof P> ? [values?: Rest<C, P>] : [values: Rest<C, P>];

/** The values a spawner's call gives: the rest, and with constants, each component they gave as a message. */
type Rest<C extends readonly Essential[], P> = [keyof P & C[number]] extends [never] ? ValuesOf<C, keyof P> : ValuesOf<C, keyof P> & Again<C, P>;

/**
 * Structural changes and writes to other entities, applied in issue order at the next sync point. They take only the
 * components commands may add: every one but those rules derive.
 */
export type Commands = {
    /**
     * The spawner of entities of exactly `components`: on the world's thread, the same function for a world, list and
     * equal constants each time while an archetype holds each shared value among them, so calling it allocates
     * nothing; on a joined thread, the same for a list and one constants object, found by its identity. `constant` gives values every entity it spawns starts with: each shared
     * component's, which the spawner must be given, since they choose the archetype, and any other's. Its call takes the
     * rest, or nothing once none of them is required, each component's value from one of the two, never both, which
     * fails the system; it returns a real entity immediately, alive at the sync point.
     */
    spawn<const C extends readonly Essential[], const P extends Preset<C> = {}>(
        components: Spawned<C, P>,
        ...constant: RequiresPreset<C> extends true ? [constant?: P & SharedPreset<C> & Named<C, P>] : [constant?: P & Named<C, P>]
    ): (...values: SpawnValues<C, P>) => Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces one component's value, marking it changed. */
    add<K extends Essential>(entity: Entity, component: K, ...value: ValueArgument<K>): void;
    /** Adds or replaces the values of `components`, marking them changed. */
    add<const C extends readonly Essential[]>(entity: Entity, components: C, values: ValuesOf<C>): void;
    remove(entity: Entity, component: Essential): void;
    remove(entity: Entity, components: readonly Essential[]): void;
    /**
     * Spawns an entity for each row of `tables`, as a readonly system's `tables` gives them, of each table's components
     * with its columns' values: a block copy per column. Entity values are rewritten as the world's references would
     * leave them had the entities outside the tables despawned: each naming an entity of the tables, a reference, a
     * struct's field or an array's item, names the one spawned for it; a row whose owner reference names an entity
     * outside them isn't spawned, nor anything it owns, through owner references, as despawning its owner would; a
     * weak reference to one is left out of its row, which is spawned without it; any other value naming one is
     * `Entity.none`. Returns, at once, each table's new entities, alive at the sync point. A column's stride must be its
     * component's in this world, and its length its table's count. `resources` sets each resource it names, by key, at
     * the sync point, as commands apply, each value checked against its resource's schema; not one only the world
     * writes, nor one living on another thread. On the world's thread only.
     */
    spawnTables(tables: readonly Table[], resources?: { readonly [key: symbol]: unknown }): Table.Spawned;
};
