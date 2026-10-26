// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../../interface/schema/schema.js';
import { matchesSchema } from '../../interface/registry/schemas.js';
import { layoutOf, type Scalar } from '../../interface/registry/layout.js';

// A shared component's values, which choose archetypes: each world interns them per component by structure, so equal
// values, compared leaf by leaf as index keys are, are one number, and an archetype holds the number of each.

/**
 * One shared component's values in a world: each distinct one once, as stored, by number. Numbers are kept at the
 * precision its schema stores them at, -0 as 0, so a row reads what a column would hold.
 */
export type SharedValues = {
    readonly schema: Schema | undefined;
    /** By number, the value as rows read it. */
    readonly values: unknown[];
    /** By number, its canonical text, which equal values share and the layout directory carries to joined threads. */
    readonly texts: string[];
    readonly byText: Map<string, number>;
    /** Primitives given before and the stored values, by identity, so finding them again builds no text. */
    readonly byValue: Map<unknown, number>;
    /**
     * For a tuple of numbers, each leaf's scalar, and the values found so far by their leaves as stored, a level a leaf:
     * a tuple given again, as a cell is, is found without building its text.
     */
    readonly lanes: readonly Scalar[] | null;
    readonly byLanes: Map<number, unknown>;
    /**
     * By number, what holds it: the archetypes holding it and its pins, a `where`'s value each. One no longer held is
     * dropped (`releaseShared`), its number reused.
     */
    readonly refs: number[];
    /** Numbers dropped, reused before new ones. */
    readonly free: number[];
    /** Numbers interned since the last sweep, dropped then if nothing holds them (`sweepShared`). */
    readonly fresh: number[];
    /** By number, its keys in `byValue` besides the stored value: primitives given that are stored as it. */
    readonly keys: unknown[][];
    /** By number, what caches it, each let go of as it's dropped: spawners and their batches. */
    readonly cached: (Set<() => void> | undefined)[];
};

/** The scalars of a schema's leaves when it's a tuple of numbers, each its own leaf; null for any other. */
const lanesOf = (schema: Schema | undefined): readonly Scalar[] | null => {
    if (schema === undefined) return null;
    let layout;
    try {
        layout = layoutOf(schema);
    }
    catch {
        return null;
    }
    if (layout.kind !== "linear" || !("type" in schema) || schema.type !== "array") return null;
    const { leaves } = layout;
    // Only leaves whose every value a lane holds exactly is of their type: a number without a range, or a 32-bit integer.
    const exact = (item: Schema, scalar: Scalar): boolean => "type" in item && (
        (item.type === "number" && item.minimum === undefined && item.maximum === undefined && scalar !== "boolean")
        || (item.type === "integer" && !("format" in item) && ((scalar === "i32" && item.minimum === -0x80000000 && item.maximum === 0x7FFFFFFF) || (scalar === "u32" && item.minimum === 0 && item.maximum === 0xFFFFFFFF))));
    return leaves.every((leaf, k) => leaf.path.length === 1 && leaf.path[0] === k && exact(schema.items, leaf.scalar)) ? leaves.map(leaf => leaf.scalar) : null;
};

export const createSharedValues = (schema: Schema | undefined): SharedValues =>
    ({ schema, values: [], texts: [], byText: new Map(), byValue: new Map(), lanes: lanesOf(schema), byLanes: new Map(), refs: [], free: [], fresh: [], keys: [], cached: [] });

/** A leaf as a column of `scalar` would hold it, -0 as 0. */
const storedLane = (scalar: Scalar, value: number): number => {
    const stored = scalar === "f32" ? Math.fround(value) : scalar === "u32" ? value >>> 0 : scalar === "i32" ? value | 0 : value;
    return Object.is(stored, -0) ? 0 : stored;
};

/** A tuple of numbers' number, found by its leaves as stored; -1 for a value of another shape, which `internShared` reads whole. */
const internLanes = (shared: SharedValues, lanes: readonly Scalar[], given: unknown): number => {
    if (!Array.isArray(given) || given.length !== lanes.length) return -1;
    let level: Map<number, unknown> = shared.byLanes;
    for (let k = 0; k < lanes.length; k++) {
        const item: unknown = given[k];
        if (typeof item !== "number") return -1;
        const lane = storedLane(lanes[k], item);
        // An integer leaf its type can't hold, a fraction or out of range, is checked whole, and refused.
        if (lane !== item && lanes[k] !== "f32" && lanes[k] !== "f64") return -1;
        const next = level.get(lane);
        if (k === lanes.length - 1) {
            if (typeof next === "number") return next;
            const number = internWhole(shared, given);
            if (number >= 0) level.set(lane, number);
            return number;
        }
        if (next instanceof Map) level = next;
        else {
            const made = new Map<number, unknown>();
            level.set(lane, made);
            level = made;
        }
    }
    return -1;
};

/** A number as its schema stores it: f32 or a 32-bit integer where the schema says, -0 as 0. */
const storedNumber = (schema: Schema | undefined, value: number): number => {
    let stored = value;
    if (schema !== undefined && "type" in schema) {
        if (schema.type === "number" && schema.precision === 1) stored = Math.fround(value);
        else if (schema.type === "integer" && !("format" in schema) && schema.minimum !== undefined && schema.maximum !== undefined) {
            if (schema.minimum >= 0 && schema.maximum <= 0xFFFFFFFF) stored = value >>> 0;
            else if (schema.minimum >= -0x80000000 && schema.maximum <= 0x7FFFFFFF) stored = value | 0;
        }
    }
    return Object.is(stored, -0) ? 0 : stored;
};

/** The member of a union a value is one of, which says how it's stored. */
const memberOf = (schema: Schema | undefined, value: unknown): Schema | undefined => {
    if (schema === undefined || !("anyOf" in schema)) return schema;
    return schema.anyOf.find(member => matchesSchema(member, value)) ?? undefined;
};

/** A comparable value as stored, with its canonical text; null for a value that isn't comparable data. */
const canonical = (schema: Schema | undefined, given: unknown, exact = false): { readonly value: unknown; readonly text: string } | null => {
    const member = memberOf(schema, given);
    if (typeof given === "number") {
        if (exact && Object.is(given, -0)) return { value: given, text: "#-0" };
        const value = storedNumber(member, given);
        return { value, text: `#${String(value)}` };
    }
    if (typeof given === "string") return { value: given, text: JSON.stringify(given) };
    if (typeof given === "boolean") return { value: given, text: given ? "t" : "f" };
    if (Array.isArray(given)) {
        const items = member !== undefined && "type" in member && member.type === "array" ? member.items : undefined;
        const value: unknown[] = [];
        const texts: string[] = [];
        for (const item of given) {
            const found = canonical(items, item, exact);
            if (found === null) return null;
            value.push(found.value);
            texts.push(found.text);
        }
        return { value, text: `[${texts.join(",")}]` };
    }
    if (typeof given !== "object" || given === null) return null;
    const prototype: unknown = Object.getPrototypeOf(given);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const properties = member !== undefined && "type" in member && member.type === "object" ? member.properties : undefined;
    const value: { [field: string]: unknown } = {};
    const fields: string[] = [];
    for (const field of Object.keys(given).sort()) {
        const item: unknown = Reflect.get(given, field);
        if (item === undefined) continue;
        const found = canonical(properties?.[field], item, exact);
        if (found === null) return null;
        value[field] = found.value;
        fields.push(`${JSON.stringify(field)}:${found.text}`);
    }
    return { value, text: `{${fields.join(",")}}` };
};

/**
 * The number of a value among a shared component's, interned the first time an equal one is given; -1 for one that
 * isn't one of its type's values.
 */
export const internShared = (shared: SharedValues, given: unknown): number => {
    const known = shared.byValue.get(given);
    if (known !== undefined) return known;
    if (shared.lanes !== null) {
        const found = internLanes(shared, shared.lanes, given);
        if (found >= 0) return found;
    }
    return internWhole(shared, given);
};

/** As `internShared`, by the value's canonical text. */
const internWhole = (shared: SharedValues, given: unknown): number => {
    if (shared.schema !== undefined && !matchesSchema(shared.schema, given)) return -1;
    const found = canonical(shared.schema, given);
    if (found === null) return -1;
    let number = shared.byText.get(found.text);
    if (number === undefined) {
        number = shared.free.pop() ?? shared.values.length;
        shared.values[number] = found.value;
        shared.texts[number] = found.text;
        shared.refs[number] = 0;
        shared.keys[number] = [];
        shared.byText.set(found.text, number);
        shared.byValue.set(found.value, number);
        shared.fresh.push(number);
    }
    // Primitives are their own identity; objects given are found again by their text, so none is held.
    if ((typeof given !== "object" || given === null) && !Object.is(given, found.value) && !shared.byValue.has(given)) {
        shared.byValue.set(given, number);
        shared.keys[number].push(given);
    }
    return number;
};

/** One more holder of value `number`: an archetype holding it, or a pin. */
export const holdShared = (shared: SharedValues, number: number): void => {
    shared.refs[number]++;
};

/** One fewer holder of value `number`, which is dropped once none is left. */
export const releaseShared = (shared: SharedValues, number: number): void => {
    if (--shared.refs[number] === 0) dropShared(shared, number);
};

/** Registers what to let go of once value `number` is dropped; returns a function unregistering it. */
export const cacheShared = (shared: SharedValues, number: number, letGo: () => void): (() => void) => {
    const held = shared.cached[number] ??= new Set();
    held.add(letGo);
    return () => { held.delete(letGo); };
};

/** Drops the values interned since the last sweep that nothing holds: given once, as a spawner's constant never spawned. */
export const sweepShared = (shared: SharedValues): void => {
    const { fresh } = shared;
    for (let k = 0; k < fresh.length; k++) {
        const number = fresh[k];
        if (shared.refs[number] === 0 && shared.texts[number] !== undefined) dropShared(shared, number);
    }
    fresh.length = 0;
};

/** Forgets value `number`: every way it's found, and what caches it, its number then reused. */
const dropShared = (shared: SharedValues, number: number): void => {
    const text = shared.texts[number];
    const value = shared.values[number];
    if (text === undefined) return;
    shared.byText.delete(text);
    if (shared.byValue.get(value) === number) shared.byValue.delete(value);
    for (const key of shared.keys[number]) if (shared.byValue.get(key) === number) shared.byValue.delete(key);
    if (shared.lanes !== null && Array.isArray(value)) forgetLanes(shared.byLanes, shared.lanes, value, number);
    const cached = shared.cached[number];
    shared.cached[number] = undefined;
    if (cached !== undefined) for (const letGo of cached) letGo();
    shared.values[number] = undefined;
    // Undefined while dropped, so a sweep or a drop finds it gone.
    Reflect.deleteProperty(shared.texts, number);
    shared.keys[number] = [];
    shared.free.push(number);
};

/** Removes a tuple's leaves from the levels that find it, and each level it left empty. */
const forgetLanes = (byLanes: Map<number, unknown>, lanes: readonly Scalar[], value: readonly unknown[], number: number): void => {
    const path: Map<number, unknown>[] = [];
    let level: Map<number, unknown> = byLanes;
    for (let k = 0; k < lanes.length; k++) {
        const item = value[k];
        if (typeof item !== "number") return;
        path.push(level);
        const next = level.get(item);
        if (k === lanes.length - 1) {
            if (next === number) level.delete(item);
            break;
        }
        if (!(next instanceof Map)) return;
        level = next;
    }
    for (let k = path.length - 1; k > 0; k--) {
        if (path[k].size > 0) break;
        const item = value[k - 1];
        if (typeof item === "number") path[k - 1].delete(item);
    }
};

/** A value from its canonical text, as a joined thread reads it from the layout directory. */
export const parseShared = (text: string): unknown => {
    let at = 0;
    const value = (): unknown => {
        const first = text[at];
        if (first === "#") {
            const start = ++at;
            while (at < text.length && text[at] !== "," && text[at] !== "]" && text[at] !== "}") at++;
            return Number(text.slice(start, at));
        }
        if (first === "t" || first === "f") {
            at++;
            return first === "t";
        }
        if (first === "\"") return string();
        if (first === "[") {
            at++;
            const items: unknown[] = [];
            while (text[at] !== "]") {
                items.push(value());
                if (text[at] === ",") at++;
            }
            at++;
            return items;
        }
        if (first === "{") {
            at++;
            const fields: { [field: string]: unknown } = {};
            while (text[at] !== "}") {
                const field = string();
                at++;
                fields[field] = value();
                if (text[at] === ",") at++;
            }
            at++;
            return fields;
        }
        throw new Error(`A shared value's text is malformed at ${at}: ${text}`);
    };
    const string = (): string => {
        const start = at++;
        while (text[at] !== "\"") at += text[at] === "\\" ? 2 : 1;
        at++;
        const parsed: unknown = JSON.parse(text.slice(start, at));
        return typeof parsed === "string" ? parsed : "";
    };
    return value();
};

/** The canonical text of comparable data as given, compared without a schema; null for any other value. */
export const textOf = (value: unknown): string | null => canonical(undefined, value)?.text ?? null;

/** As `textOf`, telling -0 from 0, as a constant not shared is copied into each spawn as given. */
export const exactTextOf = (value: unknown): string | null => canonical(undefined, value, true)?.text ?? null;
