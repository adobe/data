// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';

/** The fields of a run's input that a leaf declares, so other members' fields aren't copied to its workers. */
export const inputFor = (leaf: Leaf): (input: unknown) => unknown => {
    const { input } = leaf.declaration;
    if (input === undefined) return () => undefined;
    const fields = Object.keys(input.properties);
    return value => {
        if (typeof value !== "object" || value === null) return value;
        const own: { [field: string]: unknown } = {};
        for (const field of fields) if (Object.hasOwn(value, field)) own[field] = Reflect.get(value, field);
        return own;
    };
};
