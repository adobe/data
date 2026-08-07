// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// A service arg is an object with method members (not an array, not a function);
// this is what distinguishes an injected service from plain data args, since the
// `Service` marker itself is all-optional and would over-match.
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

// A strongly-typed call to one method of service `S`: `[methodName, ...its args]`.
export type Call<S> = {
  [M in keyof S]-?: S[M] extends (...a: infer A) => unknown ? readonly [M, ...A] : never;
}[keyof S];

// Expected side effects for a case, keyed by the service-typed args only. An
// `Array` value asserts these calls in this order; a `Set` value asserts the same
// calls in any order.
export type Effects<Args> = {
  readonly [K in keyof Args as IsService<Args[K]> extends true ? K : never]?:
    | readonly Call<Args[K]>[]
    | ReadonlySet<Call<Args[K]>>;
};

// One spec-owned conformance case: a `data/` transform's `{ before, args, after }`
// authored as full `State`, optionally with the side effects it makes on its
// injected service args. Shared unchanged by the spec aggregator (`spec.test.ts`)
// and the ecs conformance runners (`services/main-service/conformance/`).
export type ConformanceCase<Args> = {
  readonly name: string;
  readonly before: State;
  readonly args: Args;
  readonly after: State;
  readonly effects?: Effects<Args>;
};

// A transform's cases, with the case `args` type derived from the transform's own
// signature — its second parameter, or `void` when it takes none.
export type Conformance<F extends (...args: never[]) => unknown> = readonly ConformanceCase<
  Parameters<F> extends [unknown, infer Args, ...unknown[]] ? Args : void
>[];

// One case for a derivation (`(state) => value`): a state `input` and the `value`
// it yields. `value` may use asymmetric matchers.
export type DerivationCase<Input, Value> = {
  readonly name: string;
  readonly input: Input;
  readonly value: Value;
};

// A derivation's cases, with `input`/`value` read from the derivation's signature.
export type Derivation<F extends (...args: never[]) => unknown> = readonly DerivationCase<
  Parameters<F>[0],
  ReturnType<F>
>[];
