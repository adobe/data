// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";

const indent = "  ";

/**
 * Converts a Schema to one or more TypeScript type declarations.
 *
 * The generated type is the source-text equivalent of `Schema.ToType<typeof schema>`:
 * it mirrors that mapping (including its deep-readonly default — a schema node opts
 * out with `mutable: true`) so the two stay interchangeable. The generator:
 *
 * - **Recurses** the whole schema tree (properties, array items, `oneOf`/`allOf`/
 *   `anyOf`, function signatures, and observe/promise/generator value types).
 * - **Deduplicates repeated object shapes.** Any object shape that would appear more
 *   than once in the output (the same structure used in ≥2 places, or the element of
 *   a fixed-length tuple of length ≥2) is pre-declared once at the top as a named
 *   `interface` and referenced by name everywhere it occurs. Shapes used exactly once
 *   stay inlined. The name is the shape's `title` (PascalCased) when present, else the
 *   referencing property key, else a generated `Shape<n>`.
 * - **Emits `description`s as `//` comments** directly above the declaration, property,
 *   or function they annotate (one comment line per line of the description).
 *
 * A schema that resolves to an object is emitted as an `interface`; anything else as a
 * `type` alias. The result references the ambient names `Blob`, `Promise`,
 * `AsyncGenerator`, `TypedBuffer` (`@adobe/data`) and `Observe` (`@adobe/data/observe`)
 * for the corresponding schema constructors; the caller supplies those imports.
 *
 * @example
 * ```typescript
 * toTypeScript(
 *   {
 *     type: "object",
 *     description: "A line segment",
 *     properties: {
 *       from: { title: "Point", type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
 *       to: { title: "Point", type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
 *     },
 *     required: ["from", "to"],
 *   },
 *   "Line",
 * );
 * // interface Point {
 * //   readonly x: number;
 * //   readonly y: number;
 * // }
 * //
 * // // A line segment
 * // interface Line {
 * //   readonly from: Point;
 * //   readonly to: Point;
 * // }
 * ```
 */
export function toTypeScript(schema: Schema, name: string): string {
  const context = createContext();
  walk(schema, undefined, 1, context);
  const hoisted = assignNames(schema, name, context);

  const declarations = hoisted.map((entry) => renderDeclaration(entry.name, entry.schema, context));
  declarations.push(renderDeclaration(name, schema, context));
  return declarations.join("\n\n");
}

interface Context {
  // Structural-shape key → number of times that shape appears in the output.
  readonly counts: Map<string, number>;
  // Shape keys in first-seen order, so declarations emit deterministically.
  readonly discovery: string[];
  // First-seen schema for each shape — used to render its shared declaration.
  readonly firstSchema: Map<string, Schema>;
  // Name candidates: the shape's own `title`, and the property key referencing it.
  readonly titleHint: Map<string, string>;
  readonly keyHint: Map<string, string>;
  // Shape key → assigned interface name, for the shapes that are hoisted + shared.
  readonly names: Map<string, string>;
}

function createContext(): Context {
  return {
    counts: new Map(),
    discovery: [],
    firstSchema: new Map(),
    titleHint: new Map(),
    keyHint: new Map(),
    names: new Map(),
  };
}

// --- Pass 1: count how many times each object shape appears in the output --------

// `multiplier` is the number of copies of the current subtree the output will contain
// (a fixed tuple of length n multiplies its element's copies by n), so an object that
// only appears once in the schema but is a repeated tuple element still deduplicates.
function walk(schema: Schema, keyHint: string | undefined, multiplier: number, context: Context): void {
  if (resolvesToObject(schema)) {
    register(schema, keyHint, multiplier, context);
  }

  if (schema.const !== undefined || schema.enum) return;
  if (schema.oneOf) return walkEach(schema.oneOf, multiplier, context);
  if (schema.anyOf) return walkEach(schema.anyOf, multiplier, context);
  if (schema.allOf) return walkEach(schema.allOf, multiplier, context);

  switch (schema.type) {
    case "typed-buffer":
      if (schema.items) walk(schema.items, undefined, multiplier, context);
      return;
    case "observe":
    case "promise":
    case "generator":
      if (schema.value) walk(schema.value, undefined, multiplier, context);
      return;
    case "function":
      if (schema.signature) {
        for (const parameter of schema.signature.parameters ?? []) {
          walk(parameter.schema, undefined, multiplier, context);
        }
        if (schema.signature.returns) walk(schema.signature.returns, undefined, multiplier, context);
      }
      return;
  }

  if (schema.type === "array" || schema.items !== undefined) {
    if (schema.items) {
      const length = tupleLength(schema);
      walk(schema.items, keyHint, length !== undefined ? multiplier * length : multiplier, context);
    }
    return;
  }
  if (schema.type === undefined && schema.default !== undefined) return;
  if (schema.type === "object" || schema.properties !== undefined) {
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      walk(child, key, multiplier, context);
    }
    const additional = schema.additionalProperties;
    if (additional !== undefined && typeof additional === "object") {
      walk(additional, undefined, multiplier, context);
    }
  }
}

function walkEach(schemas: readonly Schema[], multiplier: number, context: Context): void {
  for (const schema of schemas) walk(schema, undefined, multiplier, context);
}

function register(schema: Schema, keyHint: string | undefined, multiplier: number, context: Context): void {
  const key = canonical(schema);
  if (!context.counts.has(key)) {
    context.counts.set(key, 0);
    context.discovery.push(key);
    context.firstSchema.set(key, schema);
  }
  context.counts.set(key, (context.counts.get(key) ?? 0) + multiplier);
  if (schema.title && !context.titleHint.has(key)) context.titleHint.set(key, schema.title);
  if (keyHint && !context.keyHint.has(key)) context.keyHint.set(key, keyHint);
}

// --- Between passes: decide which shapes are hoisted and name them ---------------

interface HoistedDeclaration {
  readonly name: string;
  readonly schema: Schema;
}

function assignNames(root: Schema, name: string, context: Context): HoistedDeclaration[] {
  const used = new Set<string>();
  const declarations: HoistedDeclaration[] = [];

  let rootKey: string | undefined;
  if (resolvesToObject(root)) {
    rootKey = canonical(root);
    context.names.set(rootKey, name);
    used.add(name);
  }

  let generated = 0;
  for (const key of context.discovery) {
    if (key === rootKey) continue;
    if ((context.counts.get(key) ?? 0) < 2) continue;
    const schema = context.firstSchema.get(key);
    if (!schema) continue;
    const base = deriveName(key, context) ?? `Shape${++generated}`;
    const unique = uniqueName(base, used);
    context.names.set(key, unique);
    used.add(unique);
    declarations.push({ name: unique, schema });
  }

  return declarations;
}

function deriveName(key: string, context: Context): string | undefined {
  const title = context.titleHint.get(key);
  if (title) {
    const cased = pascalCase(title);
    if (cased) return cased;
  }
  const propertyKey = context.keyHint.get(key);
  if (propertyKey) {
    const cased = pascalCase(propertyKey);
    if (cased) return cased;
  }
  return undefined;
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}${index}`)) index++;
  return `${base}${index}`;
}

// --- Pass 2: render ------------------------------------------------------------

function renderDeclaration(name: string, schema: Schema, context: Context): string {
  const comment = commentBlock(schema.description, "");
  return resolvesToObject(schema)
    ? `${comment}interface ${name} ${objectBody(schema, 0, context)}`
    : `${comment}type ${name} = ${typeExpression(schema, 0, context)};`;
}

// Branches follow `ToType`'s resolution order so the produced type matches it.
function typeExpression(schema: Schema, depth: number, context: Context): string {
  const readonly = schema.mutable !== true;

  if (schema.const !== undefined) return literal(schema.const, depth, readonly);
  if (schema.enum) return union(schema.enum.map((value) => literal(value, depth, readonly)));
  if (schema.oneOf) return union(schema.oneOf.map((sub) => typeExpression(sub, depth, context)));
  if (schema.anyOf) return union(schema.anyOf.map((sub) => typeExpression(sub, depth, context)));
  if (schema.allOf) return intersection(schema.allOf.map((sub) => typeExpression(sub, depth, context)));

  switch (schema.type) {
    case "number":
    case "integer":
      return "number";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "blob":
      return "Blob";
    case "typed-buffer":
      return `TypedBuffer<${schema.items ? typeExpression(schema.items, depth, context) : "unknown"}>`;
  }

  if (schema.type === "array" || schema.items !== undefined) {
    return arrayExpression(schema, depth, context);
  }
  if (schema.type === undefined && schema.default !== undefined) {
    return literal(schema.default, depth, readonly);
  }
  if (schema.type === "object" || schema.properties !== undefined) {
    // A hoisted shape is referenced by its name; a one-off shape is inlined.
    return context.names.get(canonical(schema)) ?? objectBody(schema, depth, context);
  }

  switch (schema.type) {
    case "observe":
      return `Observe<${valueExpression(schema, depth, context)}>`;
    case "promise":
      return `Promise<${valueExpression(schema, depth, context)}>`;
    case "generator":
      return `AsyncGenerator<${valueExpression(schema, depth, context)}>`;
    case "function":
      return functionExpression(schema, depth, context);
  }

  return "any";
}

function arrayExpression(schema: Schema, depth: number, context: Context): string {
  const readonly = schema.mutable !== true ? "readonly " : "";
  if (schema.items === undefined) return `${readonly}any[]`;

  const element = typeExpression(schema.items, depth, context);
  const length = tupleLength(schema);
  if (length !== undefined) {
    return `${readonly}[${Array.from({ length }, () => element).join(", ")}]`;
  }

  const item = isCompound(schema.items) ? `(${element})` : element;
  return `${readonly}${item}[]`;
}

function objectBody(schema: Schema, depth: number, context: Context): string {
  const readonly = schema.mutable !== true ? "readonly " : "";
  const pad = indent.repeat(depth + 1);
  const required = new Set(schema.required ?? []);
  const members: string[] = [];

  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    const optional = required.has(key) ? "" : "?";
    // A `propertyMeta` description is the author's explicit field doc — it wins and is
    // never suppressed; otherwise fall back to the property type's own description.
    const description = schema.propertyMeta?.[key]?.description ?? propertyDescription(propSchema, context);
    const comment = commentBlock(description, pad);
    members.push(
      `${comment}${pad}${readonly}${propertyKey(key)}${optional}: ${typeExpression(propSchema, depth + 1, context)};`,
    );
  }

  const additional = schema.additionalProperties;
  if (additional === true) {
    members.push(`${pad}${readonly}[key: string]: any;`);
  } else if (additional !== undefined && additional !== false) {
    members.push(`${pad}${readonly}[key: string]: ${typeExpression(additional, depth + 1, context)};`);
  }

  if (members.length === 0) return "{}";
  return `{\n${members.join("\n")}\n${indent.repeat(depth)}}`;
}

// A property's comment, suppressed when it merely repeats the description already
// carried by the hoisted interface it references (so the type's own doc wins and the
// property comment survives only when it says something independent of the type).
function propertyDescription(propSchema: Schema, context: Context): string | undefined {
  if (propSchema.description === undefined) return undefined;
  if (!resolvesToObject(propSchema)) return propSchema.description;
  const key = canonical(propSchema);
  if (!context.names.has(key)) return propSchema.description;
  return propSchema.description === context.firstSchema.get(key)?.description
    ? undefined
    : propSchema.description;
}

// The wrapped value schema for observe/promise/generator; absent ⇒ any.
function valueExpression(schema: Schema, depth: number, context: Context): string {
  return schema.value ? typeExpression(schema.value, depth, context) : "any";
}

function functionExpression(schema: Schema, depth: number, context: Context): string {
  const { signature } = schema;
  if (!signature) return "() => void";
  const parameters = signature.parameters ?? [];
  const returns = signature.returns ? typeExpression(signature.returns, depth, context) : "void";

  // With no argument docs, keep the compact single-line form; otherwise break each
  // parameter onto its own line so its description can sit directly above it.
  if (!parameters.some((parameter) => parameter.description)) {
    const params = parameters
      .map((parameter) => `${parameter.name}: ${typeExpression(parameter.schema, depth, context)}`)
      .join(", ");
    return `(${params}) => ${returns}`;
  }

  const pad = indent.repeat(depth + 1);
  const lines = parameters.map((parameter) => {
    const comment = commentBlock(parameter.description, pad);
    return `${comment}${pad}${parameter.name}: ${typeExpression(parameter.schema, depth + 1, context)},`;
  });
  return `(\n${lines.join("\n")}\n${indent.repeat(depth)}) => ${returns}`;
}

// --- Shared helpers ------------------------------------------------------------

// An object schema is only rendered as an interface/object when nothing with higher
// precedence in `ToType` (const/enum/oneOf/allOf/anyOf) overrides the object type.
function resolvesToObject(schema: Schema): boolean {
  if (schema.const !== undefined || schema.enum || schema.oneOf || schema.allOf || schema.anyOf) {
    return false;
  }
  return schema.type === "object" || schema.properties !== undefined;
}

function tupleLength(schema: Schema): number | undefined {
  return schema.minItems !== undefined && schema.minItems === schema.maxItems ? schema.minItems : undefined;
}

// Structural identity of a shape, ignoring documentation metadata (`title`,
// `description`) so shapes that differ only in docs still deduplicate.
function canonical(schema: Schema): string {
  return JSON.stringify(normalizeShape(schema));
}

function normalizeShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeShape);
  if (value !== null && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      // Documentation metadata never affects the structural shape identity, so shapes
      // that differ only in docs still deduplicate.
      if (key === "title" || key === "description" || key === "propertyMeta") continue;
      normalized[key] = normalizeShape(child);
    }
    return normalized;
  }
  return value;
}

// Renders a JSON value as a TypeScript literal type, matching the deep-readonly
// treatment `ToType` gives `const`/`enum`/`default` values.
function literal(value: unknown, depth: number, readonly: boolean): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
  }
  const modifier = readonly ? "readonly " : "";
  if (Array.isArray(value)) {
    return `${modifier}[${value.map((entry) => literal(entry, depth, readonly)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const pad = indent.repeat(depth + 1);
    const body = entries
      .map(([key, entry]) => `${pad}${modifier}${propertyKey(key)}: ${literal(entry, depth + 1, readonly)};`)
      .join("\n");
    return `{\n${body}\n${indent.repeat(depth)}}`;
  }
  return "unknown";
}

// A `description` rendered as `//` comment line(s) with a trailing newline, so it
// prefixes the declaration/property/function line it annotates. Empty when absent.
function commentBlock(description: string | undefined, pad: string): string {
  if (!description) return "";
  return description.split("\n").map((line) => `${pad}// ${line}\n`).join("");
}

// A union/intersection/function element must be parenthesized before an array `[]` suffix.
function isCompound(schema: Schema): boolean {
  return (
    (schema.enum !== undefined && schema.enum.length > 1) ||
    (schema.oneOf !== undefined && schema.oneOf.length > 1) ||
    (schema.anyOf !== undefined && schema.anyOf.length > 1) ||
    (schema.allOf !== undefined && schema.allOf.length > 1) ||
    schema.type === "function"
  );
}

function union(parts: readonly string[]): string {
  return parts.length === 0 ? "never" : parts.join(" | ");
}

function intersection(parts: readonly string[]): string {
  return parts.length === 0 ? "{}" : parts.join(" & ");
}

const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function propertyKey(key: string): string {
  return identifier.test(key) ? key : JSON.stringify(key);
}

function pascalCase(input: string): string {
  const cased = input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  if (!cased) return "";
  return /^[A-Za-z_$]/.test(cased) ? cased : `_${cased}`;
}
