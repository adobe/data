// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";

/**
 * Build a reusable value converter from an `input` schema to an `output` schema,
 * or return `null` when no automatic conversion exists.
 *
 * The analysis is done ONCE, here; the returned function is a specialized closure
 * meant to be applied to every element of a homogeneous collection (e.g. a
 * TypedBuffer column) without re-inspecting the schemas per element. A `null`
 * return IS the "not convertible" answer — there is no separate predicate.
 *
 * Supported automatic conversions:
 *   - **number/integer → number/integer**: pass-through; when the output declares
 *     `minimum`/`maximum`, values are clamped into range (so a narrowing like a
 *     capped integer keeps its cap). Precision/width loss (F64→F32, float→int) is
 *     applied by the destination buffer's typed-array write, not here.
 *   - **boolean → boolean**, **string → string**: identity.
 *   - **enum → enum**: only when every input value is also an output value.
 *   - **→ const**: any input, every element becomes the output's const value.
 *   - **object → object**: per output property, convert the matching input
 *     property, or fill from the output property's default when the input lacks
 *     it. A new output property with no producible default ⇒ not convertible
 *     (`null`). Input-only properties are dropped; property order is irrelevant.
 *   - **array → array**: element-wise via `items`; a fixed-length output longer
 *     than a fixed-length input fills the extra slots from the item default (or
 *     is not convertible without one).
 *
 * Anything else — a change of kind (number↔object, number↔enum, …) — returns
 * `null`. Cosmetic schema differences are irrelevant; only the value shape is.
 */
export function createCoerceFunction(
    input: Schema,
    output: Schema,
): null | ((value: unknown) => unknown) {
    // Any input collapses to the output's fixed value.
    if (output.const !== undefined) {
        const constValue = output.const;
        return () => constValue;
    }

    const outKind = kindOf(output);
    const inKind = kindOf(input);

    switch (outKind) {
        case "number": {
            if (inKind !== "number") return null;
            return numberCoercer(output);
        }
        case "boolean":
            return inKind === "boolean" ? identity : null;
        case "string":
            return inKind === "string" ? identity : null;
        case "enum": {
            const allowed = new Set(output.enum);
            if (input.enum && input.enum.every((v) => allowed.has(v))) return identity;
            if (input.const !== undefined && allowed.has(input.const)) return identity;
            return null;
        }
        case "object": {
            if (inKind !== "object") return null;
            return objectCoercer(input, output);
        }
        case "array": {
            if (inKind !== "array") return null;
            return arrayCoercer(input, output);
        }
        default:
            return null;
    }
}

type Kind = "number" | "boolean" | "string" | "object" | "array" | "enum" | "unknown";

// The value-shape category a schema describes. Storage kind (struct vs array
// buffer) is irrelevant — coercion is value-shaped. A bare `const`/`enum` schema
// (no explicit type) is categorized from its value(s).
function kindOf(schema: Schema): Kind {
    if (schema.enum && schema.enum.length > 0) return "enum";
    switch (schema.type) {
        case "number":
        case "integer":
            return "number";
        case "boolean":
            return "boolean";
        case "string":
            return "string";
        case "object":
            return "object";
        case "array":
            return "array";
    }
    if (schema.const !== undefined) return kindOfValue(schema.const);
    return "unknown";
}

function kindOfValue(value: unknown): Kind {
    switch (typeof value) {
        case "number":
            return "number";
        case "boolean":
            return "boolean";
        case "string":
            return "string";
        case "object":
            return value === null ? "unknown" : Array.isArray(value) ? "array" : "object";
        default:
            return "unknown";
    }
}

const identity = (value: unknown): unknown => value;

function numberCoercer(output: Schema): (value: unknown) => unknown {
    const hasMin = output.minimum !== undefined;
    const hasMax = output.maximum !== undefined;
    if (!hasMin && !hasMax) return identity;
    const min = output.minimum ?? -Infinity;
    const max = output.maximum ?? Infinity;
    return (value) => {
        const n = value as number;
        return n < min ? min : n > max ? max : n;
    };
}

function objectCoercer(
    input: Schema,
    output: Schema,
): null | ((value: unknown) => unknown) {
    const outProps = output.properties ?? {};
    const inProps = input.properties ?? {};
    // Precompute, per output property, how to produce its value: either coerce
    // the matching input property or supply a fixed default for a new property.
    const fields: [key: string, produce: (source: Record<string, unknown>) => unknown][] = [];
    for (const key of Object.keys(outProps)) {
        const outSchema = outProps[key]!;
        const inSchema = inProps[key];
        if (inSchema !== undefined) {
            const sub = createCoerceFunction(inSchema, outSchema);
            if (sub === null) return null; // an existing field cannot be converted
            fields.push([key, (source) => sub(source[key])]);
        } else {
            const def = defaultValue(outSchema);
            if (def === NO_DEFAULT) return null; // new field with no default ⇒ not convertible
            fields.push([key, () => cloneDefault(def)]);
        }
    }
    return (value) => {
        const source = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const [key, produce] of fields) result[key] = produce(source);
        return result;
    };
}

function arrayCoercer(
    input: Schema,
    output: Schema,
): null | ((value: unknown) => unknown) {
    const outItems = output.items;
    const inItems = input.items;
    if (!outItems || !inItems) return null;
    const elem = createCoerceFunction(inItems, outItems);
    if (elem === null) return null;

    const outFixed = fixedLength(output);
    if (outFixed === undefined) {
        // Variable-length output: map every input element.
        return (value) => (value as unknown[]).map(elem);
    }
    // Fixed-length output. If a fixed-length input is shorter, the extra slots
    // need an item default; without one the conversion is not possible.
    const inFixed = fixedLength(input);
    const def = defaultValue(outItems);
    if (inFixed !== undefined && inFixed < outFixed && def === NO_DEFAULT) return null;
    return (value) => {
        const arr = value as unknown[];
        const result = new Array<unknown>(outFixed);
        for (let i = 0; i < outFixed; i++) {
            result[i] = i < arr.length ? elem(arr[i]) : cloneDefault(def);
        }
        return result;
    };
}

function fixedLength(schema: Schema): number | undefined {
    return schema.minItems !== undefined && schema.minItems === schema.maxItems
        ? schema.minItems
        : undefined;
}

// A sentinel distinct from `undefined`, which is itself a legitimate default.
const NO_DEFAULT = Symbol("no-default");

// The default value a schema produces, or NO_DEFAULT when none can be built.
// An explicit `default`/`const` wins; an object/fixed-array is buildable only
// when every one of its parts has a producible default (recursively).
function defaultValue(schema: Schema): unknown {
    if (schema.default !== undefined) return schema.default;
    if (schema.const !== undefined) return schema.const;
    switch (kindOf(schema)) {
        case "object": {
            const props = schema.properties ?? {};
            const result: Record<string, unknown> = {};
            for (const key of Object.keys(props)) {
                const def = defaultValue(props[key]!);
                if (def === NO_DEFAULT) return NO_DEFAULT;
                result[key] = def;
            }
            return result;
        }
        case "array": {
            const length = fixedLength(schema);
            if (length === undefined || !schema.items) return NO_DEFAULT;
            const def = defaultValue(schema.items);
            if (def === NO_DEFAULT) return NO_DEFAULT;
            return Array.from({ length }, () => cloneDefault(def));
        }
        default:
            return NO_DEFAULT;
    }
}

// Defaults seed NEW fields (they are not source data), so give each element its
// own copy of an object/array default rather than aliasing one instance across
// every row. Primitives are shared as-is.
function cloneDefault(def: unknown): unknown {
    if (def === null || typeof def !== "object") return def;
    return structuredClone(def);
}
