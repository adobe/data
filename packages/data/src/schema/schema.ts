// © 2026 Adobe. MIT License. See /LICENSE for details.

export type JSONPath = string;
export type JSONMergePatch = unknown;

export type Layout = "std140" | "packed";

/**
 * Conditional patch applied to the path when the enclosing schema branch is active
 * and `match` is not present or validates against the root.
 * This is used for dynamic schemas which change in response to the value of the data.
 */
export type Conditional = {
  match?: Schema;
  // // root-anchored JSONPath
  path: JSONPath;
  // // JSON-Merge-Patch fragment
  value: JSONMergePatch;
}

// Data types describe serializable/storable values. The type-constructor types
// (observe/promise/generator/function) describe data-adjacent *types* — reactive
// values, async values, streams, and callables — so a Schema can describe a
// service surface, not just data. Like `blob`/`typed-buffer`, these are confined
// by usage: they belong in service/interface schemas, never in ECS component,
// resource, or typed-buffer schemas (which handle-or-throw at runtime, as today).
const schemaTypes = { number: true, integer: true, string: true, boolean: true, null: true, array: true, object: true, 'typed-buffer': true, blob: true, observe: true, promise: true, generator: true, function: true } as const;

export interface Schema {
  // Never set: it keeps a `Parameter` (`{ name, schema }`) from being mistaken for
  // the schema it wraps.
  readonly schema?: never;
  type?: keyof typeof schemaTypes;
  // Names a TypeScript type that JSON Schema cannot describe (`Response`,
  // `HTMLElement`, `ReadableStream`, …), for service schemas only. Set it on a
  // schema with no `type`. `toTypeScript` emits the name verbatim; `ToType`
  // resolves a global class name to its instance type, and any other name to `any`.
  typeName?: string;
  // Not supported: OpenAPI's `nullable`. Use `oneOf: [schema, { type: "null" }]`
  // (see `Nullable`).
  nullable?: never;
  title?: string;
  description?: string;
  conditionals?: readonly Conditional[];
  nonPersistent?: boolean;
  // Marks state as local to this client — never replicated to peers. Orthogonal
  // to nonPersistent (which is about durability): together they place an entity
  // in one of four quadrants, each with its own entity-id space. See also the
  // built-in `nonShared` component and entity/persistence-sharing.
  nonShared?: boolean;
  // When true (only valid on a primitive schema), every distinct runtime value
  // of this component is stored in its own archetype: the value is lifted into
  // archetype identity and held as a const column (zero per-row bytes). Entities
  // sharing a value are therefore contiguous — the storage-level partition a
  // coarse spatial broad-phase wants. See the archetype `Router` return of
  // `ensureArchetype` and the partition `where` filter on `queryArchetypes`.
  partition?: boolean;
  // Marks an integer schema as an ECS entity reference (the id of another entity),
  // not a plain number. `Entity.schema` sets it; every component/resource/arg that
  // holds an entity id reuses that schema and so inherits the mark. Conformance
  // testing walks schemas for this flag to know which numbers are ids — so it can
  // compare a State spec to its ECS implementation up to an id-bijection (the two
  // mint different id sets) without the case author hand-labelling every reference.
  entity?: boolean;
  mutable?: boolean; // defaults to false
  default?: any;
  // Name of a zero-arg factory that mints this component's value at insert time
  // when the insert row omits it — resolved to a `() => value` by the store's
  // `defaultFactories` registry (see CreateStoreOptions), exactly as
  // `interpolators` names are resolved by the animation system. A serializable
  // NAME, never a function — a Schema is pure JSON. Unlike `default` (one shared
  // literal, backfilled on load), the factory runs PER insert, so each entity
  // gets a fresh value — the intended shape for a per-entity identity such as a
  // cross-runtime GUID. A component naming a factory is OPTIONAL at insert: omit
  // it and the factory mints one; SUPPLY it (replication-inbound / load) and the
  // supplied value wins, so the factory never runs. Naming a factory the registry
  // does not provide is a construction-time error (fail fast, not per insert).
  defaultFactory?: string;
  precision?: 1 | 2;
  multipleOf?: number;
  mediaType?: string; // media type such as image/jpeg, image/png, video/* etc.
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: Schema;
  // The wrapped value type for the `observe`/`promise`/`generator` constructors:
  // `{ type: "observe", value: S }` → `Observe<ToType<S>>`, etc. Absent ⇒ any.
  value?: Schema;
  /**
   * The signature of the `function` constructor, grouped so these members live
   * only on function schemas rather than on every `Schema`:
   * `{ type: "function", signature: { parameters, returns } }` →
   * `(...args) => ToType<returns>`. Absent `parameters` ⇒ no args; absent
   * `returns` ⇒ void; absent `signature` entirely ⇒ `() => void`.
   *
   * Each parameter is a named descriptor (`Parameter`) rather than a bare schema,
   * so the argument's name and its own documentation are known independently of
   * its type (`parameter.schema`). `parameter.description` documents the argument;
   * `parameter.schema.description` documents the type. Neither affects `ToType`,
   * which derives the call signature positionally from `parameter.schema`.
   * A bare Schema entry is the deprecated positional form; read either with
   * `Parameter.schemaOf`.
   */
  signature?: {
    readonly parameters?: readonly (Parameter | Schema)[];
    readonly returns?: Schema;
  };
  /**
   * Exposure policy for **untrusted channels**, valid on any schema (an action, a
   * state, a nested group). For a function it governs invocation; for any other
   * member it governs visibility (e.g. `toTypeScript` omits members hidden from the
   * agent). Pure metadata: does NOT affect `ToType` or service-schema validation.
   * Resolve it with `resolveExternalInvocation(schema)` — the single source of
   * truth — rather than re-deriving per call site.
   *
   * The two channels have **deliberately opposite default polarity**, matching
   * their trust level:
   * - `link` — a deeplink / URL: the least-trusted channel (anyone can craft a URL
   *   and get a victim to open it in their authenticated session).
   *   **Default-deny whitelist**: exposed only when `link === true`.
   * - `agent` — an agent acting on the user's behalf: more trusted.
   *   **Default-allow blacklist**: exposed unless `agent === false`.
   */
  external?: { readonly agent?: boolean; readonly link?: boolean };
  properties?: { readonly [key: string]: Schema };
  // Per-property metadata kept OUT of `properties` so a property whose type is a
  // shared/by-reference schema can carry field-level docs without mutating that
  // shared type. Keyed by the same property name as `properties`. Pure metadata:
  // does NOT affect `ToType` (a schema differing only in `propertyMeta` derives
  // the same type). See `PropertyMeta`.
  propertyMeta?: { readonly [key: string]: PropertyMeta };
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  oneOf?: readonly Schema[];
  allOf?: readonly Schema[];
  anyOf?: readonly Schema[];
  const?: any;
  enum?: readonly any[];
  layout?: Layout; // Memory layout for typed buffers (std140 or packed)
  // Per-type interpolation overrides for the animation system, as serializable
  // NAMES (not functions — a Schema is pure JSON data). Each name is resolved to
  // an interpolator by the consuming animation system's registry (see
  // `@adobe/data-gpu` animation-track). Schemas omit this when the componentwise
  // lerp / step default is correct (Vec3, scalar, …); `Quat` declares
  // `{ linear: "slerp" }` so quaternion tracks interpolate on the 4-sphere.
  interpolators?: {
    readonly linear?: string;
    readonly step?: string;
    readonly cubicSpline?: string;
  };
}

/**
 * A named function parameter: the argument's `name` and `description` are known
 * independently of its type (`schema`). `description` documents the argument;
 * `schema.description` documents the type. Only `schema` affects `ToType`.
 */
export interface Parameter {
  readonly name: string;
  readonly description?: string;
  readonly schema: Schema;
}

/**
 * Field-level metadata for one object property, held in `Schema.propertyMeta` so it
 * stays independent of the property's (possibly shared) type. This interface is the
 * extension point for future per-field metadata that must not live on the type.
 */
export interface PropertyMeta {
  readonly description?: string;
}
