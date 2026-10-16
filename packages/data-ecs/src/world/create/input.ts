import { sameDeclaration } from '../../registry/same-declaration.js';
import type { Schema } from '../../schema/schema.js';
import type { Leaf } from '../../system/leaf.js';

/** Throws unless each leaf's input is an object schema of named fields, and a field several declare has one schema. */
export const checkInputs = (leaves: readonly Leaf[]): void => {
    const fields = new Map<string, { readonly schema: Schema; readonly system: string }>();
    for (const { declaration: { name, input } } of leaves) {
        if (input === undefined) continue;
        const schema: Schema = input;
        if (!("type" in schema) || schema.type !== "object" || typeof schema.properties !== "object" || schema.properties === null) {
            throw new Error(`System "${name}": input is an object schema of named fields.`);
        }
        for (const [field, property] of Object.entries(schema.properties)) {
            const seen = fields.get(field);
            if (seen === undefined) fields.set(field, { schema: property, system: name });
            else if (!sameDeclaration(seen.schema, property)) {
                throw new Error(`Systems "${seen.system}" and "${name}" declare input field "${field}" with different schemas.`);
            }
        }
    }
};

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
