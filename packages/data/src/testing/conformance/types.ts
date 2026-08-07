// © 2026 Adobe. MIT License. See /LICENSE for details.

// A service arg is an object with method members (not an array, not a function);
// this is what distinguishes an injected service from plain data args.
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
// A no-arg method is just `[methodName]`.
export type ServiceCall<S> = {
  [M in keyof S]-?: S[M] extends (...a: infer A) => unknown ? readonly [M, ...A] : never;
}[keyof S];

// Expected side effects for a case, keyed by the service-typed args only. An
// `Array` value asserts these calls in this order; a `Set` value asserts the same
// calls in any order. Method names and their args are checked against the service.
export type Effects<Args> = {
  readonly [K in keyof Args as IsService<Args[K]> extends true ? K : never]?:
    | readonly ServiceCall<Args[K]>[]
    | ReadonlySet<ServiceCall<Args[K]>>;
};

// The case `args` type read from a transform's own signature — its second
// parameter, or `void` when it takes none.
type ArgsOf<F extends (...args: never[]) => unknown> = Parameters<F> extends [unknown, infer Args, ...unknown[]]
  ? Args
  : void;

// One spec-owned conformance case: a `data/` transform's `{ before, args, after }`
// authored as full `State`, optionally with the side effects it makes on its
// injected service args. `args` is OMITTABLE exactly when the transform takes
// none. Shared unchanged by the spec aggregator and the ecs conformance runners.
export type Case<State, Args> = {
  readonly name: string;
  readonly before: State;
  readonly after: State;
  readonly effects?: Effects<Args>;
} & ([Args] extends [void] ? { readonly args?: undefined } : { readonly args: Args });

// A transform's cases, with the case `args` derived from the transform's own
// signature — author `export const cases: Conformance.Cases<State, typeof theTransform>`
// (features alias it to a one-arg `Cases<F>` binding `State` once), so the cases
// cannot drift from what the function accepts.
export type Cases<State, F extends (...args: never[]) => unknown> = readonly Case<State, ArgsOf<F>>[];

// One case for a derivation (`(state) => value`): a state `input` and the `value`
// it yields. `value` may use asymmetric matchers. Both the pure derivation and its
// ecs computed are checked against these.
export type DerivationCase<Input, Value> = {
  readonly name: string;
  readonly input: Input;
  readonly value: Value;
};

// A derivation's cases, with `input` and `value` read from the derivation's own
// signature — the `Cases` analog for value-producing derivations.
export type DerivationCases<F extends (...args: never[]) => unknown> = readonly DerivationCase<
  Parameters<F>[0],
  ReturnType<F>
>[];
