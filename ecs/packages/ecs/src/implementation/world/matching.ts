// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Path, Views } from '../../interface/registry/layout.js';
import { samePath } from '../../interface/registry/layout.js';
import { matchesSchema } from '../../interface/registry/schemas.js';
import type { Schema } from '../../interface/schema/schema.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';

/** The operators of bounds on a number. */
const operators = new Set(["<", "<=", ">", ">=", "!=="]);

const isRecord = (value: unknown): value is { readonly [key: string]: unknown } => typeof value === "object" && value !== null && !Array.isArray(value);

const isBounds = (value: unknown): value is { readonly [operator: string]: number } =>
    isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(([operator, bound]) => operators.has(operator) && typeof bound === "number");

/** Whether `value` passes `bounds`, each one it gives. */
const withinBounds = (value: number, bounds: { readonly [operator: string]: number }): boolean => {
    for (const operator in bounds) {
        const bound = bounds[operator];
        switch (operator) {
            case "<": if (!(value < bound)) return false; break;
            case "<=": if (!(value <= bound)) return false; break;
            case ">": if (!(value > bound)) return false; break;
            case ">=": if (!(value >= bound)) return false; break;
            default: if (!(value !== bound)) return false;
        }
    }
    return true;
};

/**
 * Whether `matching` is what a value of `schema` can match: a value of it; for a number, bounds too; for a struct or
 * tuple, matches of any of its members.
 */
export const isMatching = (schema: Schema, matching: unknown): boolean => {
    if (matchesSchema(schema, matching)) return true;
    if ("anyOf" in schema) return schema.anyOf.some(member => isMatching(member, matching));
    if ("allOf" in schema || "const" in schema) return false;
    switch (schema.type) {
        case "number": case "integer": return isBounds(matching);
        case "object": return isRecord(matching) && Object.entries(matching).every(([field, member]) => field in schema.properties && isMatching(schema.properties[field] ?? { allOf: [] }, member));
        case "array": return isRecord(matching) && Object.entries(matching).every(([index, member]) => /^\d+$/.test(index) && Number(index) < (schema.maxItems ?? Infinity) && isMatching(schema.items, member));
        default: return false;
    }
};

/** Whether `matching` is or holds a Set or Map, whose contents a match can't name. */
export const holdsCollection = (matching: unknown): boolean =>
    matching instanceof Set || matching instanceof Map || (typeof matching === "object" && matching !== null && !ArrayBuffer.isView(matching) && Object.values(matching).some(holdsCollection));

/**
 * Whether a value matches `matching`, as `isMatching` takes it: a number its bounds, a struct or tuple its members', an
 * array given whole an array of its length.
 */
export const matchesValue = (value: unknown, matching: unknown): boolean => {
    if (typeof value === "number" && isBounds(matching)) return withinBounds(value, matching);
    if (typeof matching === "object" && matching !== null && typeof value === "object" && value !== null) {
        if (Array.isArray(matching) && Reflect.get(value, "length") !== matching.length) return false;
        for (const key of Object.keys(matching)) if (!matchesValue(Reflect.get(value, key), Reflect.get(matching, key))) return false;
        return true;
    }
    return value === matching;
};

/** A test of one scalar leaf of a row: the leaf's place, and the value or bounds it matches. */
type LeafTest = { readonly path: Path; readonly matching: unknown };

/** The leaf tests a match of a linear component makes, by the paths of its scalars. */
const leafTestsOf = (matching: unknown, path: Path, tests: LeafTest[]): void => {
    if (typeof matching === "object" && matching !== null && !isBounds(matching)) {
        for (const key of Object.keys(matching)) leafTestsOf(Reflect.get(matching, key), [...path, Array.isArray(matching) || /^\d+$/.test(key) ? Number(key) : key], tests);
        return;
    }
    tests.push({ path, matching });
};

/** Whether a row of an archetype matches: a test of its values, made for the archetype once. */
export type RowTest = (row: number) => boolean;

/** Bounds as numbers a row's value is compared with, each one not given open: `!==` is NaN, which no value equals. */
type CompiledBounds = { readonly above: number; readonly from: number; readonly below: number; readonly to: number; readonly not: number };

const compiled = (bounds: { readonly [operator: string]: number }): CompiledBounds => ({
    above: bounds[">"] ?? -Infinity, from: bounds[">="] ?? -Infinity, below: bounds["<"] ?? Infinity, to: bounds["<="] ?? Infinity, not: bounds["!=="] ?? NaN,
});

/** One leaf a row test reads: its view and place in it, and the value it equals or the bounds it passes. */
type LeafRead = { readonly array: Views[keyof Views]; readonly stride: number; readonly offset: number; readonly boolean: boolean; readonly bounds: CompiledBounds | null; readonly equals: unknown };

/** A row test reading each leaf straight from its view, comparing as JS compares the value read, or null for a layout it can't. */
const linearTest = (storage: Storage, tests: readonly LeafTest[]): RowTest | null => {
    const { layout } = storage;
    if (layout.kind !== "linear") return null;
    const reads: LeafRead[] = [];
    for (const { path, matching } of tests) {
        const leaf = layout.leaves.find(candidate => samePath(candidate.path, path));
        if (leaf === undefined) return null;
        reads.push({ array: storage.views[leaf.view], stride: leaf.unitStride, offset: leaf.unitOffset, boolean: leaf.scalar === "boolean", bounds: isBounds(matching) ? compiled(matching) : null, equals: matching });
    }
    return row => {
        for (let k = 0; k < reads.length; k++) {
            const { array, stride, offset, boolean, bounds, equals } = reads[k];
            const stored = array[row * stride + offset];
            if (bounds !== null) {
                if (!(stored > bounds.above && stored >= bounds.from && stored < bounds.below && stored <= bounds.to && stored !== bounds.not)) return false;
            }
            else if ((boolean ? stored !== 0 : stored) !== equals) return false;
        }
        return true;
    };
};

/**
 * What a `despawnWhere`'s `where` tests: of each archetype, whether its shared values match, and a test of its rows'
 * values where it names other components, made from the archetype's storages when it's tested; null for an
 * archetype whose rows all pass.
 */
export type DespawnMatch = {
    readonly archetype: (archetype: Archetype) => boolean;
    readonly rows: ((archetype: Archetype) => RowTest) | null;
    /** By component id, what its value matches, to test an entity whose values the sync point's commands give. */
    readonly values: ReadonlyMap<number, unknown>;
};

/**
 * A `despawnWhere`'s test from what each component it names matches, by component id: shared components' by their
 * archetype's value, those of `exact` through `sharedHolds`, which tests the values they give as interned, the rest by
 * each row's.
 */
export const despawnMatchOf = (matched: ReadonlyMap<number, unknown>, shared: ReadonlySet<number>, exact: ReadonlySet<number>, sharedHolds: ((archetype: Archetype) => boolean) | null): DespawnMatch => {
    const sharedMatched = [...matched].filter(([id]) => shared.has(id) && !exact.has(id));
    const rowMatched = [...matched].filter(([id]) => !shared.has(id));
    const archetype = (candidate: Archetype): boolean => {
        if (sharedHolds !== null && !sharedHolds(candidate)) return false;
        for (const [id, matching] of sharedMatched) {
            const layout = candidate.storageById[id]?.layout;
            if (layout === undefined || layout.kind !== "constant" || !matchesValue(layout.value, matching)) return false;
        }
        return true;
    };
    const rows = rowMatched.length === 0 ? null : (candidate: Archetype): RowTest => {
        const tests: RowTest[] = [];
        for (const [id, matching] of rowMatched) {
            const storage = candidate.storageById[id];
            if (storage === undefined) return () => false;
            const leaves: LeafTest[] = [];
            leafTestsOf(matching, [], leaves);
            tests.push(linearTest(storage, leaves) ?? (row => matchesValue(readCell(storage, row), matching)));
        }
        if (tests.length === 1) return tests[0];
        return row => {
            for (let t = 0; t < tests.length; t++) if (!tests[t](row)) return false;
            return true;
        };
    };
    return { archetype, rows, values: matched };
};

/** Whether a command's value is a `despawnWhere`'s match, which only `despawnMatchOf` makes. */
export const isDespawnMatch = (value: unknown): value is DespawnMatch =>
    typeof value === "object" && value !== null && "archetype" in value && typeof value.archetype === "function" && "rows" in value && "values" in value && value.values instanceof Map;
