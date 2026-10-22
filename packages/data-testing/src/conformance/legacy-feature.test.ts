// © 2026 Adobe. MIT License. See /LICENSE for details.
// The deprecated `Conformance.feature` manifest still conforms through `checkSpec` and
// `checkFeature` with its original semantics: `bump` is covered only by a same-named
// transaction (no action), and `relabel` calls a value method no case schedules, which
// the lenient doubles answer with `undefined`.
import { Database } from "@adobe/data/ecs";
import { feature } from "./legacy-feature.js";
import { checkSpec } from "./check-spec.js";
import { checkFeature } from "./check-feature.js";
import type { SpecCases } from "./feature-types.js";

type State = { readonly count: number; readonly label: string };

interface Namer {
  readonly serviceName: "namer";
  next: () => string | undefined;
}

const bump = (state: Pick<State, "count">, { by }: { readonly by: number }): Pick<State, "count"> => ({ count: state.count + by });
const relabel = (_state: State, { namer }: { readonly namer: Namer }): Pick<State, "label"> => ({ label: namer.next() ?? "unnamed" });

const createNamer = (): Namer => ({ serviceName: "namer", next: () => "fake" });

const plugin = Database.Plugin.create({
  services: { namer: (): Namer => createNamer() },
  resources: { count: { default: 0 as number }, label: { default: "" as string } },
  transactions: {
    bump: (t, { by }: { readonly by: number }) => {
      t.resources.count += by;
    },
    setLabel: (t, label: string) => {
      t.resources.label = label;
    },
  },
  actions: {
    relabel: (db) => {
      db.transactions.setLabel(db.services.namer.next() ?? "unnamed");
    },
  },
});
type Store = Database.Plugin.ToStore<typeof plugin>;

const bumpCases: SpecCases<State, typeof bump> = {
  cases: [{ name: "adds", before: { count: 1 }, args: { by: 2 }, after: { count: 3 } }],
};
const relabelCases: SpecCases<State, typeof relabel> = {
  cases: [
    { name: "uses the scheduled name", before: {}, responses: { namer: { next: ["Ada"] } }, after: { label: "Ada" } },
    { name: "falls back when nothing is scheduled", before: {}, after: { label: "unnamed" } },
  ],
};

const manifest = feature({
  state: { create: (): State => ({ count: 0, label: "" }), samples: [{ count: 4, label: "x" }] },
  fns: { bump, relabel },
  cases: { bump: bumpCases, relabel: relabelCases },
  services: { namer: createNamer },
  plugin,
  projection: {
    fromState: (store: Store, state: State): void => {
      store.resources.count = state.count;
      store.resources.label = state.label;
    },
    toState: (store: Store): State => ({ count: store.resources.count, label: store.resources.label }),
  },
});

checkSpec(manifest);
checkFeature(manifest);
