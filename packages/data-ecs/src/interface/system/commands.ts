import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Essential } from '../component/value.js';

/**
 * Values for any subset of the components commands may add, keyed by their symbols: every one but those rules derive.
 * String keys are never a component's, so they're ignored.
 */
type EssentialValues = { readonly [K in Essential]?: Component.Value<K> };

/** Structural changes and writes to other entities, applied in issue order at the next sync point. */
export type Commands = {
    /** Returns a real entity immediately; it becomes alive at the sync point. */
    spawn(values: EssentialValues): Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces values, marking them changed. */
    add(entity: Entity, values: EssentialValues): void;
    remove(entity: Entity, ...components: readonly Essential[]): void;
};
