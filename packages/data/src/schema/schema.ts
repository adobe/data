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
  type?: keyof typeof schemaTypes;
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
  // Signature of the `function` constructor: `{ type: "function", parameters,
  // returns }` → `(...args) => ToType<returns>`. Absent `parameters` ⇒ no args;
  // absent `returns` ⇒ void.
  parameters?: readonly Schema[];
  returns?: Schema;
  /**
   * Invocation policy for a `function` schema — who may call it from an
   * **untrusted channel**. Read at runtime by the executor that performs the
   * invocation; it is pure metadata and does NOT affect the type produced by
   * `Schema.ToType` (a function differing only in `external` derives the same
   * signature), nor does it affect service-schema validation or lazy wrapping.
   *
   * The two channels have **deliberately opposite default polarity**, matching
   * their trust level. Resolve them with `resolveExternalInvocation(schema)`
   * (see `external.ts`) — the single source of truth — rather than re-deriving
   * per call site, because getting the `link` default wrong is a security hole.
   *
   * - `link` — a deeplink / URL: the least-trusted channel (anyone can craft a
   *   URL and get a victim to open it in their authenticated session).
   *   **Default-deny whitelist**: link-invocable only when `link === true`;
   *   absent or `false` ⇒ not link-invocable.
   * - `agent` — an agent acting on the user's behalf: more trusted.
   *   **Default-allow blacklist**: agent-invocable unless `agent === false`.
   */
  external?: { readonly agent?: boolean; readonly link?: boolean };
  properties?: { readonly [key: string]: Schema };
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  oneOf?: readonly Schema[];
  allOf?: readonly Schema[];
  anyOf?: readonly Schema[];
  const?: any;
  enum?: readonly any[];
  layout?: Layout; // Memory layout for typed buffers (std140 or packed)
  // Per-type interpolation overrides used by the animation system. Schemas omit
  // this when the componentwise lerp / step default is correct (Vec3, scalar, …).
  // Quat declares { linear: slerp } so quaternion tracks are interpolated on the
  // 4-sphere instead of component-wise.
  interpolators?: {
    readonly linear?: (prev: any, next: any, t: number) => any;
    readonly step?: (prev: any, next: any, t: number) => any;
    readonly cubicSpline?: (prev: any, next: any, t: number) => any;
  };
}
