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

// One case for a derivation (`(state) => value`): a state `input` and the `value` it
// yields. `value` may use asymmetric matchers. Used internally by the runners to
// dispatch on case shape (the authored surface is `SpecDerivationCase` in feature-types).
export type DerivationCase<Input, Value> = {
  readonly name: string;
  readonly input: Input;
  readonly value: Value;
};
