// © 2026 Adobe. MIT License. See /LICENSE for details.
// Type-level checks for the deprecated `feature` manifest's two compile-time guards: the `cases`
// coverage guard (exactly one case module per conformed fn) and the `hydrate`
// exactness guard (exactly the entity-list derivations, no more, no fewer). Each guard
// gets a POSITIVE case (must compile) and NEGATIVE cases (`@ts-expect-error`, must NOT
// compile) — a negative that stops failing turns the directive into an "unused
// directive" error, so the guard can't silently rot.
import type { Database, Entity } from "@adobe/data/ecs";
import { feature } from "./legacy-feature.js";
import type { CaseModule, SpecCases, SpecDerivations } from "./feature-types.js";

type Foo = { readonly name: string };
type State = { readonly entities: ReadonlyMap<number, Foo>; readonly count: number };

// A transition (2 params) and an entity-list derivation (returns `readonly Foo[]`, so
// its ecs computed emits ids → it MUST be hydrated).
const bump = (s: Pick<State, "count">, args: { readonly by: number }): Pick<State, "count"> => ({ count: s.count + args.by });
const listFoos = (s: Pick<State, "entities">): readonly Foo[] => [...s.entities.values()];
const fns = { bump, listFoos };

interface Store {
  readonly componentSchemas: Record<string, unknown>;
}
declare const plugin: Database.Plugin;
declare const computedPlugin: Database.Plugin;
declare const state: { create(): State; readonly samples?: readonly State[] };

// A concrete projection whose `toData` returns the entity value `Foo` — that return
// type is what tells the guard `listFoos` is an entity-list derivation.
const projection = {
  fromState: (_store: Store, _s: State): void => {},
  toState: (_store: Store): State => ({ entities: new Map(), count: 0 }),
  toData: (_store: Store, _e: Entity): Foo => ({ name: "" }),
};

const bumpCases: SpecCases<State, typeof bump> = {
  cases: [{ name: "bumps", before: {}, args: { by: 1 }, after: { count: 1 } }],
};
const listFoosCases: SpecDerivations<typeof listFoos> = {
  cases: [{ name: "lists", input: { entities: new Map() }, value: [] }],
};

// POSITIVE — every fn has a case, and `hydrate` is exactly the entity-list derivation.
export const ok = feature({ state, fns, plugin, computedPlugin, projection, hydrate: ["listFoos"], cases: { bump: bumpCases, listFoos: listFoosCases } });

// NEGATIVE (cases coverage) — a conformed fn with no case module.
// @ts-expect-error — `cases` is missing `listFoos`
export const missingCase = feature({ state, fns, plugin, computedPlugin, projection, hydrate: ["listFoos"], cases: { bump: bumpCases } });

// NEGATIVE (cases coverage) — a case module for a name that is not a conformed fn.
// @ts-expect-error — `cases` has `bogus`, which is not in `fns`
export const extraCase = feature({ state, fns, plugin, computedPlugin, projection, hydrate: ["listFoos"], cases: { bump: bumpCases, listFoos: listFoosCases, bogus: bumpCases } });

// NEGATIVE (hydrate exactness) — an entity-list derivation left out of `hydrate`.
// @ts-expect-error — `hydrate` is missing the entity-list derivation `listFoos`
export const missingHydrate = feature({ state, fns, plugin, computedPlugin, projection, hydrate: [], cases: { bump: bumpCases, listFoos: listFoosCases } });

// NEGATIVE (hydrate exactness) — a non-entity-list fn listed in `hydrate`.
// @ts-expect-error — `hydrate` lists `bump`, which does not need hydration
export const extraHydrate = feature({ state, fns, plugin, computedPlugin, projection, hydrate: ["listFoos", "bump"], cases: { bump: bumpCases, listFoos: listFoosCases } });

// ── `SpecCases` case-shape guards (tested directly, without the manifest) ──────────
// A service-injected transition: `log` is fire-and-forget (void), `next` returns a value.
interface Logger {
  log: (msg: string) => void;
  next: () => Promise<number>;
}
const record = (s: Pick<State, "count">, args: { readonly by: number; readonly logger: Logger }): Pick<State, "count"> => ({
  count: s.count + args.by + (args.logger.log("x"), 0),
});

// POSITIVE — data-only `args` (the `logger` service is stripped), a scheduled return for
// the value method `next`, and the void `log` asserted in `effects`.
export const recOk: SpecCases<State, typeof record> = {
  cases: [{ name: "ok", before: {}, args: { by: 1 }, responses: { logger: { next: [5] } }, after: { count: 6 }, effects: { logger: [["log", "x"]] } }],
};

// NEGATIVE — a live service instance in `args` (args are DATA only).
// @ts-expect-error — `logger` is a service; it must not appear in `args`
export const recBadArgsService: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: { by: 1, logger: {} }, after: { count: 1 } }] };

// NEGATIVE — a required data arg omitted.
// @ts-expect-error — `args` is missing the required `by`
export const recMissingArg: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: {}, after: { count: 1 } }] };

// NEGATIVE — scheduling a response for a `void` method (only value methods take one).
// @ts-expect-error — `log` is void; it cannot be scheduled in `responses`
export const recVoidResponse: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: { by: 1 }, responses: { logger: { log: ["y"] } }, after: { count: 1 } }] };

// NEGATIVE — a scheduled response of the wrong payload type (`next` yields `number`).
// @ts-expect-error — `next` yields `number`, not `string`
export const recWrongResponse: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: { by: 1 }, responses: { logger: { next: ["nope"] } }, after: { count: 1 } }] };

// POSITIVE — a `throws` case (no `after`/`effects`/`responses`).
export const recThrows: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: { by: 1 }, throws: "boom" }] };

// NEGATIVE — `after` and `throws` are mutually exclusive.
// @ts-expect-error — a case is either an `after` expectation or a `throws`, never both
export const recBoth: SpecCases<State, typeof record> = { cases: [{ name: "x", before: {}, args: { by: 1 }, after: { count: 1 }, throws: true }] };

// ── `CaseModule` transition/derivation discrimination ──────────────────────────────
// The KIND is the authored `SpecCases`/`SpecDerivations` annotation, NOT the fn's
// signature — arity and return-type structure are both unsound discriminators, so
// `CaseModule` is a bare union. These pin the cases the union must (and must not) admit.

// POSITIVE — a no-arg, service-free transition `(state) => patch`. This is the exact
// regression the old arity-based `CaseModule` caused (one param → misread as derivation).
declare const reset: (s: Pick<State, "count">) => Pick<State, "count">;
declare const resetCases: SpecCases<State, typeof reset>;
export const resetOk: CaseModule<State, typeof reset> = resetCases;

// POSITIVE — an async transition `(state, args) => Promise<patch>` (return is a Promise,
// so a return-type-`extends Partial<State>` check would have misclassified it).
declare const saveAsync: (s: Pick<State, "count">, a: { readonly id: number }) => Promise<Pick<State, "count">>;
declare const asyncCases: SpecCases<State, typeof saveAsync>;
export const asyncOk: CaseModule<State, typeof saveAsync> = asyncCases;

// POSITIVE — derivations returning an array (also a hydration key), a set, and a scalar.
export const arrOk: CaseModule<State, typeof listFoos> = listFoosCases;
declare const idsOf: (s: State) => ReadonlySet<number>;
declare const idsCases: SpecDerivations<typeof idsOf>;
export const setOk: CaseModule<State, typeof idsOf> = idsCases;
declare const total: (s: State) => number;
declare const totalCases: SpecDerivations<typeof total>;
export const scalarOk: CaseModule<State, typeof total> = totalCases;

// NEGATIVE — wrong-arm annotation, caught by the envelope's content (not its arity).
// @ts-expect-error — a transition envelope cannot hold derivation-shaped `{ input, value }` cases
export const wrongTransition: SpecCases<State, typeof reset> = { cases: [{ name: "x", input: { count: 0 }, value: 0 }] };
// @ts-expect-error — a derivation envelope cannot hold transition-shaped `{ before, after }` cases
export const wrongDerivation: SpecDerivations<typeof total> = { cases: [{ name: "x", before: {}, after: { count: 1 } }] };

// NEGATIVE — mis-pairing an array-derivation module into a transition fn's slot, caught
// by the `ReturnType`/args mismatch inside the envelope generics.
// @ts-expect-error — a derivation module for `listFoos` is not a valid case module for the transition `bump`
export const mispair: CaseModule<State, typeof bump> = listFoosCases;

// RESIDUAL GAP (documented, deliberately compiles — NOT a `@ts-expect-error`): a
// transition-shaped module accepted for a `(state) => value` derivation, because args
// align (`ArgsOf` is void) and a state patch is a valid `after`. Unreachable from the
// signature; caught by the conformance run when it name-pairs against a computed.
declare const count: (s: State) => number;
export const residualGap: CaseModule<State, typeof count> = resetCases;

// ── `computedPlugin` requiredness (needed iff the manifest has a derivation) ─────────
// `fns` above has `listFoos` (a derivation), so `ok` (which includes `computedPlugin`)
// is the POSITIVE. NEGATIVE — omit it with a derivation present:
// @ts-expect-error — `computedPlugin` is required because `listFoos` is a derivation
export const missingComputedPlugin = feature({ state, fns, plugin, projection, hydrate: ["listFoos"], cases: { bump: bumpCases, listFoos: listFoosCases } });

// POSITIVE — a transition-only feature may omit `computedPlugin` (no derivations).
const txFns = { bump };
declare const txCases: SpecCases<State, typeof bump>;
export const noComputedOk = feature({ state, fns: txFns, plugin, projection, cases: { bump: txCases } });

// ── `services` requiredness (needed iff a fn injects a service) ──────────────────────
declare const logger: Logger;
const svcFns = { record };
declare const recordCases: SpecCases<State, typeof record>;

// POSITIVE — the injected service `logger` has a template.
export const servicesOk = feature({ state, fns: svcFns, plugin, projection, services: { logger: () => logger }, cases: { record: recordCases } });

// NEGATIVE — a fn injects `logger`, but `services` is omitted (today: a runtime crash).
// @ts-expect-error — `services` is required because `record` injects `logger`
export const missingServices = feature({ state, fns: svcFns, plugin, projection, cases: { record: recordCases } });

// NEGATIVE — `services` omits the required `logger` template.
// @ts-expect-error — `services` is missing the `logger` template
export const incompleteServices = feature({ state, fns: svcFns, plugin, projection, services: {}, cases: { record: recordCases } });

// NEGATIVE — a service-free feature must not carry dead templates.
// @ts-expect-error — `bump` injects no service, so `services` must be absent
export const extraServices = feature({ state, fns: txFns, plugin, projection, services: { logger: () => logger }, cases: { bump: txCases } });
