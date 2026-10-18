import type { Reduction } from '../../interface/resource/reduction.js';
import type { Declaration } from '../../interface/system/declaration.js';
import { isReduction } from '../../interface/registry/reduction.js';
import type { Path, View } from '../../interface/registry/layout.js';
import { stampChanged } from './archetype.js';
import { readCell, writeCell } from './cells.js';
import { resourceCell } from './resources.js';
import { idOf, type Key, type State } from './state.js';
import { labelOf } from '../../interface/registry/index.js';

/** A resource a system reduces into: its operator, and the scalar leaves of its value. */
export type ReductionTarget = {
    readonly key: Key;
    readonly operator: Reduction;
    readonly leaves: readonly { readonly path: Path; readonly view: View; readonly boolean: boolean }[];
};

const bitwise: ReadonlySet<Reduction> = new Set(["&", "|", "^"]);


/** The resources a declaration reduces into, checked against their layouts. Throws for one that can't be reduced. */
export const reductionTargets = (state: State, { name, reduce, resources }: Pick<Declaration, "name" | "reduce" | "resources">): readonly ReductionTarget[] => {
    if (reduce === undefined) return [];
    const others = new Set<Key>([...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? []]);
    return Reflect.ownKeys(reduce).flatMap((key): ReductionTarget[] => {
        const operator: unknown = Reflect.get(reduce, key);
        if (operator === undefined) return [];
        if (!isReduction(operator)) throw new Error(`System "${name}" reduces "${labelOf(key)}" with "${labelOf(operator)}", which isn't an operator.`);
        if (others.has(key)) throw new Error(`System "${name}" reduces "${labelOf(key)}", so it can't also read, write or filter on it.`);
        const layout = state.layouts[idOf(state, key)];
        if (layout?.kind !== "linear") throw new Error(`System "${name}" reduces "${labelOf(key)}", which isn't stored in linear memory.`);
        const leaves = layout.leaves.map(leaf => ({ path: leaf.path, view: leaf.view, boolean: leaf.scalar === "boolean" }));
        if (leaves.some(leaf => leaf.boolean) && !bitwise.has(operator)) {
            throw new Error(`System "${name}" reduces "${labelOf(key)}", which has boolean values, with "${operator}"; booleans reduce with "&", "|" or "^".`);
        }
        return [{ key, operator, leaves }];
    });
};

/** Each operator's identity, as a fold starts from it, and what an empty fold gives. */
export const identityOf = (operator: Reduction): number => {
    switch (operator) {
        case "+": case "|": case "^": return 0;
        case "*": return 1;
        case "&": return -1;
        case "min": return Infinity;
        case "max": return -Infinity;
    }
};

/** One step of a fold, with JS semantics. Partials are f64; a result rounds or wraps once, when it's stored. */
export const combine = (operator: Reduction, a: number, b: number): number => {
    switch (operator) {
        case "+": return a + b;
        case "*": return a * b;
        case "&": return a & b;
        case "|": return a | b;
        case "^": return a ^ b;
        case "min": return Math.min(a, b);
        case "max": return Math.max(a, b);
    }
};

const integerRange: { readonly [V in View]?: readonly [number, number] } = {
    u8: [0, 255], i32: [-(2 ** 31), 2 ** 31 - 1], u32: [0, 2 ** 32 - 1],
};

/** A folded leaf in its stored form: a boolean, or an empty `min` or `max` of integers as the type's own extreme. */
const stored = (value: number, operator: Reduction, view: View, boolean: boolean): number | boolean => {
    if (boolean) return (value & 1) !== 0;
    const range = integerRange[view];
    const empty = (operator === "min" && value === Infinity) || (operator === "max" && value === -Infinity);
    return range !== undefined && empty ? (value > 0 ? range[1] : range[0]) : value;
};

const withLeaf = (value: unknown, path: Path, leaf: unknown): unknown => {
    const [first, ...rest] = path;
    if (first === undefined) return leaf;
    const copy: unknown = Array.isArray(value) ? [...value] : { ...Object(value) };
    Reflect.set(Object(copy), first, withLeaf(Reflect.get(Object(value), first), rest, leaf));
    return copy;
};

const leafOf = (value: unknown, path: Path): unknown => path.reduce<unknown>((item, key) => Reflect.get(Object(item), key), value);

/** The value a fold contributes to a leaf: booleans as 0 or 1. */
export const contributed = (value: unknown, path: Path): number => Number(leafOf(value, path));

/**
 * Writes a target's folded leaves, `values[offset + i]` for leaf `i`, and stamps the resource changed at `tick` only
 * if a stored leaf differs, so readers filtering on it run only when it does.
 */
export const writeReduction = (state: State, target: ReductionTarget, values: ArrayLike<number>, offset: number, tick: number): void => {
    const { storage, row } = resourceCell(state, target.key);
    const before = readCell(storage, row);
    const next = target.leaves.reduce<unknown>((value, leaf, i) => withLeaf(value, leaf.path, stored(values[offset + i] ?? NaN, target.operator, leaf.view, leaf.boolean)), before);
    writeCell(storage, row, next);
    const after = readCell(storage, row);
    if (target.leaves.some(leaf => !Object.is(leafOf(before, leaf.path), leafOf(after, leaf.path)))) stampChanged(storage, row, tick);
};
