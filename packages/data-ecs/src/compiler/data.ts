import type { Node } from 'estree';
import type { Path } from '../world/create/kernel.js';
import { fail } from './failure.js';
import type { Expression } from './ir.js';
import { scalar } from './scalar.js';
import type { Scope } from './scope.js';
import type { Value } from './value.js';

/** A value with a statically known shape: scalar leaves as expressions. */
export type Data =
    | { readonly kind: "leaf"; readonly expression: Expression }
    | { readonly kind: "tuple"; readonly items: readonly Data[] }
    | { readonly kind: "struct"; readonly fields: readonly (readonly [string, Data])[] };

/** Converts a value to data. Values of unknown shape become one leaf. */
export const toData = (value: Value, node: Node, scope: Scope): Data => {
    switch (value.kind) {
        case "tuple": return { kind: "tuple", items: value.items.map(item => toData(item, node, scope)) };
        case "struct": return { kind: "struct", fields: value.fields.map(([name, field]) => [name, toData(field, node, scope)]) };
        default: return { kind: "leaf", expression: scalar(value, node, scope) };
    }
};

export type Leaf = { readonly path: Path; readonly expression: Expression };

export const leavesOf = (data: Data, prefix: Path = []): readonly Leaf[] => {
    switch (data.kind) {
        case "leaf": return [{ path: prefix, expression: data.expression }];
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
export const mapLeaves = (data: Data, map: (expression: Expression, path: Path) => Expression, prefix: Path = []): Data => {
    switch (data.kind) {
        case "leaf": return { kind: "leaf", expression: map(data.expression, prefix) };
        case "tuple": return { kind: "tuple", items: data.items.map((item, index) => mapLeaves(item, map, [...prefix, index])) };
        case "struct": return { kind: "struct", fields: data.fields.map(([name, field]) => [name, mapLeaves(field, map, [...prefix, name])]) };
    }
};

export const dataValue = (data: Data): Value => {
    switch (data.kind) {
        case "leaf": return { kind: "scalar", expression: data.expression };
        case "tuple": return { kind: "tuple", items: data.items.map(dataValue) };
        case "struct": return { kind: "struct", fields: data.fields.map(([name, field]) => [name, dataValue(field)]) };
    }
};

/** Data as a JS value, for command arguments. */
export const materialize = (data: Data): Expression => {
    switch (data.kind) {
        case "leaf": return data.expression;
        case "tuple": return { kind: "array", items: data.items.map(materialize) };
        case "struct": return { kind: "record", fields: data.fields.map(([name, field]) => [name, materialize(field)]) };
    }
};

export const requireSameShape = (node: Node, a: Data, b: Data): void => {
    if (!sameShape(a, b)) fail(node, "both values must have the same shape");
};
