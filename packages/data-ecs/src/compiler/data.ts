import type { Node } from 'estree';
import type { Path } from '../world/create/kernel.js';
import { fail } from './failure.js';
import { scalar } from './scalar.js';
import type { Scope } from './scope.js';
import type { Value } from './value.js';

/** A value with a statically known shape: scalar leaves as code. */
export type Data =
    | { readonly kind: "leaf"; readonly code: string }
    | { readonly kind: "tuple"; readonly items: readonly Data[] }
    | { readonly kind: "struct"; readonly fields: readonly (readonly [string, Data])[] };

/** Converts a value to data. Values of unknown shape become one leaf. */
export const toData = (value: Value, node: Node, scope: Scope): Data => {
    switch (value.kind) {
        case "tuple": return { kind: "tuple", items: value.items.map(item => toData(item, node, scope)) };
        case "struct": return { kind: "struct", fields: value.fields.map(([name, field]) => [name, toData(field, node, scope)]) };
        default: return { kind: "leaf", code: scalar(value, node, scope) };
    }
};

export type Leaf = { readonly path: Path; readonly code: string };

export const leavesOf = (data: Data, prefix: Path = []): readonly Leaf[] => {
    switch (data.kind) {
        case "leaf": return [{ path: prefix, code: data.code }];
        case "tuple": return data.items.flatMap((item, index) => leavesOf(item, [...prefix, index]));
        case "struct": return data.fields.flatMap(([name, field]) => leavesOf(field, [...prefix, name]));
    }
};

export const sameShape = (a: Data, b: Data): boolean => {
    switch (a.kind) {
        case "leaf": return b.kind === "leaf";
        case "tuple": return b.kind === "tuple" && a.items.length === b.items.length && a.items.every((item, index) => sameShape(item, b.items[index]));
        case "struct": return b.kind === "struct" && a.fields.length === b.fields.length
            && a.fields.every(([name, field], index) => b.fields[index][0] === name && sameShape(field, b.fields[index][1]));
    }
};

/** Rebuilds data with each leaf replaced. */
export const mapLeaves = (data: Data, map: (code: string, path: Path) => string, prefix: Path = []): Data => {
    switch (data.kind) {
        case "leaf": return { kind: "leaf", code: map(data.code, prefix) };
        case "tuple": return { kind: "tuple", items: data.items.map((item, index) => mapLeaves(item, map, [...prefix, index])) };
        case "struct": return { kind: "struct", fields: data.fields.map(([name, field]) => [name, mapLeaves(field, map, [...prefix, name])]) };
    }
};

export const dataValue = (data: Data): Value => {
    switch (data.kind) {
        case "leaf": return { kind: "scalar", code: data.code };
        case "tuple": return { kind: "tuple", items: data.items.map(dataValue) };
        case "struct": return { kind: "struct", fields: data.fields.map(([name, field]) => [name, dataValue(field)]) };
    }
};

/** Data as a JS value expression, for command arguments. */
export const materialize = (data: Data): string => {
    switch (data.kind) {
        case "leaf": return data.code;
        case "tuple": return `[${data.items.map(materialize).join(", ")}]`;
        case "struct": return `{ ${data.fields.map(([name, field]) => `${JSON.stringify(name)}: ${materialize(field)}`).join(", ")} }`;
    }
};

export const requireSameShape = (node: Node, a: Data, b: Data): void => {
    if (!sameShape(a, b)) fail(node, "both values must have the same shape");
};
