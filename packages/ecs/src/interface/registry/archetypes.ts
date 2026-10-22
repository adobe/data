// © 2026 Adobe. MIT License. See /LICENSE for details.
import { labelOf } from './names.js';

/** Where an archetype holds its program-wide index: a property no other code names. */
const indexKey = Symbol("archetypeIndex");

let next = 0;

/**
 * Gives a list of components a program-wide index, once, after checking it names no component twice. Throws for a
 * component listed twice.
 */
export const indexArchetype = (components: readonly unknown[]): void => {
    for (let k = 1; k < components.length; k++) {
        if (components.indexOf(components[k]) < k) throw new Error(`An archetype lists "${labelOf(components[k])}" twice.`);
    }
    if (!Reflect.has(components, indexKey)) Object.defineProperty(components, indexKey, { value: next++ });
};

/** The program-wide index `Archetype.create` gave a list, or -1 for a list it wasn't given. */
export const archetypeIndexOf = (components: readonly unknown[]): number => {
    const index: unknown = Reflect.get(components, indexKey);
    return typeof index === "number" ? index : -1;
};
