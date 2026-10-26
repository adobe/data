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

/** The keys of a list made at runtime, in its order, and the one program-wide index every list of them shares. */
export type Interned = { readonly keys: readonly unknown[]; readonly index: number };

type Node = { interned: Interned | null; readonly next: Map<unknown, Node> };

const root: Node = { interned: null, next: new Map() };

/**
 * The index lists made at runtime of `list`'s keys, in its order, share: given the first time, then found without
 * allocating, so lists made on every call take one index between them.
 */
export const internArchetype = (list: readonly unknown[]): Interned => {
    let node = root;
    for (let k = 0; k < list.length; k++) {
        const key = list[k];
        let next = node.next.get(key);
        if (next === undefined) node.next.set(key, next = { interned: null, next: new Map() });
        node = next;
    }
    return node.interned ??= { keys: [...list], index: nextArchetypeIndex() };
};
