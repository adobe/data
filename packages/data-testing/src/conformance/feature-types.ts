// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/data/schema";
import type { Effects } from "./types.js";

// A service arg is an object with method members (not an array, not a function) —
// the same discriminator `types.ts` uses, re-derived here so this file stands alone.
type MethodKeys<T> = { [K in keyof T]-?: T[K] extends (...a: never[]) => unknown ? K : never }[keyof T];
type IsService<T> = T extends readonly unknown[]
  ? false
  : T extends (...a: never[]) => unknown
    ? false
    : T extends object
      ? [MethodKeys<T>] extends [never]
        ? false
        : true
      : false;

// A transform's args type — its second parameter, or `void` when it takes none.
export type ArgsOf<F> = F extends (...a: never[]) => unknown
  ? Parameters<F> extends [unknown, infer A, ...unknown[]]
    ? A
    : void
  : void;

// The payload a method's return unwraps to: a Promise's resolution, an async
// generator's yield, or a sync value as-is. A case schedules PAYLOADS — the runner
// hands each straight back, and an `await` on a non-promise unwraps it fine.
type Payload<R> = R extends Promise<infer T>
  ? T
  : R extends AsyncGenerator<infer T, unknown, unknown>
    ? T
    : R;
type ScheduleOf<M> = M extends (...a: never[]) => infer R ? readonly Payload<R>[] : never;

// Only VALUE-returning methods take a schedule; `void` methods are excluded from
// the type, so a case can't author a response for a fire-and-forget effect.
type ValueMethodKeys<S> = {
  [M in keyof S]-?: S[M] extends (...a: never[]) => infer R ? ([Payload<R>] extends [void] ? never : M) : never;
}[keyof S];
type ServiceResponses<S> = { readonly [M in ValueMethodKeys<S>]?: ScheduleOf<S[M]> };

// A case's scheduled service RETURNS, keyed by the service-typed args only — the
// return-value counterpart of `Effects<Args>`. Each entry is a per-method FIFO the
// runner's recording double drains; the case owns the values, so its `after`/
// `effects` never guess at what the double invents (the anti-pattern the old
// hardcoded fakes fell into).
export type Responses<Args> = {
  readonly [K in keyof Args as IsService<Args[K]> extends true ? K : never]?: ServiceResponses<Args[K]>;
};

// The case's authored `args`, with injected-service fields removed — a case carries
// only DATA; the recording doubles are synthesized by the runner from the feature's
// `services` templates plus this case's `responses`.
export type DataArgKeys<Args> = { [K in keyof Args]-?: IsService<Args[K]> extends true ? never : K }[keyof Args];
type DataArgs<Args> = Pick<Args, DataArgKeys<Args>>;

// One inert transition case: `before`/`after` state deltas, DATA-only `args`, and
// the test-only channels `effects` (calls to assert) and `responses` (returns to
// schedule) — or a `throws` expectation. No live service instance ever appears.
export type SpecCase<State, Args> = ({ readonly name: string; readonly before: Partial<State> } & (
  | {
      readonly after: Partial<State>;
      readonly effects?: Effects<Args>;
      readonly responses?: Responses<Args>;
      readonly throws?: undefined;
    }
  | { readonly throws: true | string; readonly after?: undefined; readonly effects?: undefined; readonly responses?: undefined }
)) &
  ([keyof DataArgs<Args>] extends [never] ? { readonly args?: undefined } : { readonly args: DataArgs<Args> });

// One inert derivation case: a state `input` and the `value` it yields.
export type SpecDerivationCase<Input, Value> = {
  readonly name: string;
  readonly input: Input;
  readonly value: Value;
};

// The envelope authored in a `*.cases.ts` file for a transition: the case list plus
// an optional `args` schema marking entity-reference fields (the ecs side resolves
// a spec-id to its seeded entity through it; the pure side never resolves).
export type SpecCases<State, F extends (...a: never[]) => unknown> = {
  readonly args?: Schema;
  readonly cases: readonly SpecCase<State, ArgsOf<F>>[];
};

// The `*.cases.ts` envelope for a derivation — cases only, never an `args` schema.
export type SpecDerivations<F extends (...a: never[]) => unknown> = {
  readonly cases: readonly SpecDerivationCase<Parameters<F>[0], ReturnType<F>>[];
};

// The value a projection hydrates one entity into — its `toData` return type. `never`
// for a feature with no entities (no `toData`), which makes nothing require hydration.
export type ProjectionValue<P> = P extends { toData?: (store: never, entity: never) => infer V } ? V : never;

// The store type a projection reads — recovered from its `toState`, so a manifest
// captures the concrete projection and the store type follows, rather than being a
// separate generic with no inference site (which would collapse to `unknown`).
export type ProjectionStore<P> = P extends { toState: (store: infer S) => unknown } ? S : unknown;

// The shape `feature` constrains a projection to — store positions are `never` (a
// bottom, so any concrete store satisfies it) purely so `P` is captured concretely
// and `ProjectionStore` / `ProjectionValue` can read its real types.
export type ProjectionShape<State> = {
  readonly fromState: (store: never, state: State) => unknown;
  readonly toState: (store: never) => State;
  readonly toData?: (store: never, entity: never) => unknown;
};

// The derivations that MUST be hydrated: those whose pure value is a collection of the
// entity value `V`. Their ecs computed emits entity ids (not values), so the runner
// must map each id through `toData` to compare against the case's value. A scalar
// derivation, or one that itself returns ids, is not listed. Transitions (which return
// state patches, never a `V` collection) never match.
export type HydrationKeys<Fns, V> = [V] extends [never]
  ? never
  : {
      [K in keyof Fns]: Fns[K] extends (...a: never[]) => infer R
        ? [R] extends [readonly V[]]
          ? K & string
          : [R] extends [ReadonlySet<V>]
            ? K & string
            : never
        : never;
    }[keyof Fns];

// Compile-time exactness for `hydrate`: `unknown` (no constraint) when the provided
// list is EXACTLY the required set, otherwise an un-satisfiable error object naming
// what is missing or extra — so `feature({...})` fails to type until `hydrate` matches.
export type HydrateExact<Provided extends readonly string[], Required extends string> = [
  Exclude<Required, Provided[number]>,
] extends [never]
  ? [Exclude<Provided[number], Required>] extends [never]
    ? unknown
    : {
        readonly __hydrateError: "hydrate lists a computed that does not need hydration";
        readonly unexpected: Exclude<Provided[number], Required>;
      }
  : {
      readonly __hydrateError: "hydrate is missing required entity-list computed(s)";
      readonly missing: Exclude<Required, Provided[number]>;
    };

// ── Requiredness of `services` and `computedPlugin`, derived at compile time ─────────

// The injected-service arg keys used across all fns — the services the runner must
// have recording-double templates for. Service detection on an ARG TYPE is reliable
// (unlike transition/derivation kind), so this set is sound. A derivation or a no-arg
// transition contributes nothing (its `ArgsOf` is `void`).
export type ServiceArgKeys<Fns> = {
  [K in keyof Fns]: {
    [A in keyof ArgsOf<Fns[K]>]-?: IsService<ArgsOf<Fns[K]>[A]> extends true ? A : never;
  }[keyof ArgsOf<Fns[K]>];
}[keyof Fns] &
  string;

// The service type registered under one arg key — unioned across the fns that inject it
// (consistent, by the one-property-one-type rule the feature model enforces).
export type ServiceForKey<Fns, K extends string> = {
  [F in keyof Fns]: K extends keyof ArgsOf<Fns[F]> ? ArgsOf<Fns[F]>[K] : never;
}[keyof Fns];

// `services` requiredness: when any fn injects a service, exactly those keys are
// required (each a factory returning that service type); otherwise `services` must be
// absent. So a feature that needs doubles cannot omit them (today: a runtime crash on
// the first service call), and a service-free feature cannot carry dead templates.
export type RequiredServices<Fns> = [ServiceArgKeys<Fns>] extends [never]
  ? { readonly services?: undefined }
  : { readonly services: { readonly [K in ServiceArgKeys<Fns>]: () => ServiceForKey<Fns, K> } };

// Whether any authored case module is a derivation envelope — i.e. the feature has
// `state/` derivations whose ecs computeds need conformance, so `computedPlugin` is
// required. Read from the concrete authored `cases` (the reliable kind marker), since
// the fn signature cannot tell a `(state) => value` derivation from a no-arg transition.
export type HasDerivations<Cases> = true extends {
  [K in keyof Cases]: Cases[K] extends SpecDerivations<(...a: never[]) => unknown> ? true : false;
}[keyof Cases]
  ? true
  : false;

// The case module the manifest requires for a given fn. The KIND — transition vs
// derivation — is authored EXPLICITLY per file: each `*.cases.ts` annotates its `cases`
// export as `SpecCases` or `SpecDerivations`, and that annotation is the discriminator.
// The union lets the authored shape flow through; nothing is inferred from the fn's
// signature, because neither axis is sound — a no-arg transition `(state) => patch` and
// a `(state) => value` derivation share an arity, an async transition returns
// `Promise<Partial<State>>` (not `Partial<State>`), and an object-shaped derivation can
// structurally look like a state patch. The two envelopes are content-disjoint
// (`before`+`after`/`throws` vs `input`+`value`) and both are generic in `F`, so a
// wrong-arm annotation, or a module paired to a fn whose args/return differ, is a
// compile error. The one residual case the compiler cannot reject — a transition-shaped
// module supplied for a `(state) => value` derivation, where args align and a state
// patch is a valid `after` — is caught by the conformance run (`discover.ts` routes on
// `"value" in case`, then name-pairs and fails loudly), the intended safety net.
export type CaseModule<State, F extends (...a: never[]) => unknown> =
  | SpecCases<State, F>
  | SpecDerivations<F>;
