import type { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';

/** Values for any subset of the components commands may add: every one but those rules derive. */
type EssentialValues = { readonly [K in Component.Essential]?: Component.Value<K> };

/** Structural changes and writes to other entities, applied in issue order at the next sync point. */
export type Commands = {
    /** Returns a real entity immediately; it becomes alive at the sync point. */
    spawn(values: EssentialValues): Entity;
    despawn(entity: Entity): void;
    /** Adds or replaces values, marking them changed. */
    add(entity: Entity, values: EssentialValues): void;
    remove(entity: Entity, ...components: readonly Component.Essential[]): void;
};
