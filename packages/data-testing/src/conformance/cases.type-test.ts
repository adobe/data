// © 2026 Adobe. MIT License. See /LICENSE for details.
// Type-level checks for the `cases` builder's args-schema pin.
import { Entity } from "@adobe/data/ecs";
import { casesBuilder } from "./cases.js";

type State = { readonly entities: ReadonlyMap<number, { readonly name: string }>; readonly selected: number };
const cases = casesBuilder<State>();

const reparent = (_s: Pick<State, "selected">, args: { readonly id: number; readonly count: number }): Pick<State, "selected"> => ({
  selected: args.id,
});
const noArgs = (_s: Pick<State, "selected">): Pick<State, "selected"> => ({ selected: 0 });

// A schema whose ToType is assignable-from the args type — accepted.
export const good = cases(
  reparent,
  { args: { type: "object", properties: { id: Entity.schema, count: { type: "integer" } }, required: ["id", "count"] } },
  { name: "ok", before: {}, args: { id: 1, count: 2 }, after: { selected: 1 } },
);
// Options form carries the schema on the value.
const _hasCases: (typeof good)["cases"] = good.cases;

// The no-args overload returns a bare array.
export const noArgsCases = cases(noArgs, { name: "n", before: {}, after: { selected: 0 } });
const _isArray: readonly unknown[] = noArgsCases;

// A schema that DIVERGES from the signature (id typed as string) must be rejected:
// `Schema.ToType<args>.id` is `string`, but the transition's `args.id` is `number`.
const badArgs = { type: "object", properties: { id: { type: "string" }, count: { type: "integer" } }, required: ["id", "count"] } as const;
// @ts-expect-error — args type is not assignable to Schema.ToType<args>
export const bad = cases(reparent, { args: badArgs }, { name: "bad", before: {}, args: { id: 1, count: 2 }, after: { selected: 1 } });
