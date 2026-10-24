// © 2026 Adobe. MIT License. See /LICENSE for details.
import { labelOf } from './names.js';

/**
 * The `Symbol.for` names of the property holding a list's program-wide archetype index, and of the global count of
 * indexes given, which code the plugin generates and every copy of the package share. Their version changes with the
 * format.
 */
export const archetypeIndexName = "@adobe/ecs/archetype@1";
export const archetypeCountName = "@adobe/ecs/archetypes@1";

/**
 * The property a list holds its index in: a number for a list the plugin or the package indexed, which never changes;
 * the world's record of a list made at runtime, which it checks against the list's keys (`world/lists.ts`).
 */
export const archetypeIndexKey: symbol = Symbol.for(archetypeIndexName);
const indexKey = archetypeIndexKey;
const countKey = Symbol.for(archetypeCountName);

/**
 * Gives a list of components a program-wide index, once, after checking it names no component twice. Throws for a
 * component listed twice. The package's own lists take it here; the plugin gives consumers' theirs.
 */
export const indexArchetype = (components: readonly unknown[]): void => {
    for (let k = 1; k < components.length; k++) {
        if (components.indexOf(components[k]) < k) throw new Error(`An archetype lists "${labelOf(components[k])}" twice.`);
    }
    if (typeof Reflect.get(components, indexKey) !== "number") Object.defineProperty(components, indexKey, { value: nextArchetypeIndex() });
};

/** The next program-wide archetype index, from the count every copy of the package and generated code share. */
export const nextArchetypeIndex = (): number => {
    const count: unknown = Reflect.get(globalThis, countKey);
    const next = typeof count === "number" ? count : 0;
    Reflect.set(globalThis, countKey, next + 1);
    return next;
};

/** The program-wide index a list was given, or -1 for one never given one, such as a list made at runtime. */
export const archetypeIndexOf = (components: readonly unknown[]): number => {
    const index: unknown = Reflect.get(components, indexKey);
    return typeof index === "number" ? index : -1;
};
