// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Essential } from '../component/value.js';
import type { ValuesOf } from './values-of.js';

/** The value an `add` of one component takes: none for a tag. */
type ValueArgument<K extends Essential> = Component.Value<K> extends true ? [value?: true] : [value: Component.Value<K>];

/**
 * Structural changes and writes to other entities, applied in issue order at the next sync point. They take only the
 * components commands may add: every one but those rules derive.
 */
export type Commands = {
    /**
     * The spawner of entities of exactly `components`: the same function for a world and list each time, so calling
     * it allocates nothing. It returns a real entity immediately, alive at the sync point.
     */
    spawn<const C extends readonly Essential[]>(components: C): (values: ValuesOf<C>) => Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces one component's value, marking it changed. */
    add<K extends Essential>(entity: Entity, component: K, ...value: ValueArgument<K>): void;
    /** Adds or replaces the values of `components`, marking them changed. */
    add<const C extends readonly Essential[]>(entity: Entity, components: C, values: ValuesOf<C>): void;
    remove(entity: Entity, component: Essential): void;
    remove(entity: Entity, components: readonly Essential[]): void;
};
