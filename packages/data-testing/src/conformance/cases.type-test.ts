// © 2026 Adobe. MIT License. See /LICENSE for details.
// Type-level checks for the `cases` builder's args-schema pin and its uniform envelope.
import { Entity } from "@adobe/data/ecs";
import { casesBuilder, derivationsBuilder } from "./cases.js";

type State = { readonly entities: ReadonlyMap<number, { readonly name: string }>; readonly selected: number };
const cases = casesBuilder<State>();
const derivations = derivationsBuilder();

const reparent = (_s: Pick<State, "selected">, args: { readonly id: number; readonly count: number }): Pick<State, "selected"> => ({
  selected: args.id,
});
const noArgs = (_s: Pick<State, "selected">): Pick<State, "selected"> => ({ selected: 0 });

// A schema whose ToType is assignable-from the args type — accepted.
export const good = cases(
  reparent,
  // No `required`: the args type `{ id, count }` is still assignable to the schema's
  // `ToType` (`{ id?, count? }`), and a marked field is detected regardless.
  { args: { type: "object", properties: { id: Entity.schema, count: { type: "integer" } } } },
  { name: "ok", before: {}, args: { id: 1, count: 2 }, after: { selected: 1 } },
);
// Both forms emit the SAME envelope `{ args?, cases }` — never a bare array.
const _hasArgs: (typeof good)["args"] = good.args;
const _hasCases: (typeof good)["cases"] = good.cases;

// The no-args overload emits the same envelope (no bare array).
export const noArgsResult = cases(noArgs, { name: "n", before: {}, after: { selected: 0 } });
const _noArgsCases: readonly unknown[] = noArgsResult.cases;

// A derivation emits `{ cases }` through the parallel builder.
const derive = (_s: State): number => _s.selected;
export const derived = derivations(derive, { name: "d", input: { entities: new Map(), selected: 0 }, value: 0 });
const _derivedCases: readonly unknown[] = derived.cases;

// A schema that DIVERGES from the signature (id typed as string) must be rejected:
// `Schema.ToType<args>.id` is `string`, but the transition's `args.id` is `number`.
const badArgs = { type: "object", properties: { id: { type: "string" }, count: { type: "integer" } } } as const;
// @ts-expect-error — args type is not assignable to Schema.ToType<args>
export const bad = cases(reparent, { args: badArgs }, { name: "bad", before: {}, args: { id: 1, count: 2 }, after: { selected: 1 } });
