// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Observe } from "../../observe/index.js";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";

// Read a computed's synchronous emission: subscribe once, capture, unsubscribe.
const readComputed = <T>(observe: Observe<T>): T => {
  let value!: T;
  let read = false;
  const unsubscribe = observe((next) => {
    value = next;
    read = true;
  });
  unsubscribe();
  if (!read) throw new Error("computed did not emit synchronously on subscribe");
  return value;
};

const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

const isDerivationModule = (module: Record<string, unknown>): boolean => {
  const cases = module["cases"];
  return (
    Array.isArray(cases) &&
    cases.length > 0 &&
    typeof cases[0] === "object" &&
    cases[0] !== null &&
    "value" in (cases[0] as object)
  );
};

// Wire one computed to a derivation's shared `{ input, value }` cases.
export type ComputedConforms<Db> = <Value>(
  name: string,
  config: {
    readonly cases: readonly { readonly name: string; readonly input: unknown; readonly value: Value }[];
    readonly computed: (db: Db) => Observe<unknown>;
    // Project the raw emission into the value shape a derivation yields. Defaults
    // to hydrating an entity-id list through `toData` (so an id-based list
    // computed needs no adapter). Override for a scalar / single-entity output.
    readonly project?: (raw: unknown, db: Db) => unknown;
  },
) => void;

export interface ComputedRunConfig<Db, Store, State> {
  // Build a db from the COMPUTED layer (`Database.toSystemDatabase(Database.create(
  // ComputedDatabase.plugin))`) — not the assembled feature db, whose higher
  // layers may `withCache` a pre-seed value that a direct `fromState` seed cannot
  // invalidate.
  readonly makeDb: () => Db;
  readonly store: (db: Db) => Store;
  readonly fromState: (store: Store, input: State) => unknown;
  // Per-entity projection used by the default `project` to hydrate id lists.
  readonly toData?: (store: Store, entity: Entity) => unknown;
  // The `data/state/` modules glob (eager) — coverage requires every derivation
  // among them (a file whose cases are `{ input, value }`) to be wired.
  readonly derivationModules: Record<string, Record<string, unknown>>;
  readonly match?: MatchOptions;
  readonly define: (conforms: ComputedConforms<Db>) => void;
}

// The single conformance test for every ecs computed backing a `data/state`
// derivation: seed the store from the case `input`, read the computed's emission,
// hydrate it, and match the derivation's `value`.
export const runComputeds = <Db, Store, State>(config: ComputedRunConfig<Db, Store, State>): void => {
  const hydrateEntities = (raw: unknown, db: Db): unknown => {
    const toData = config.toData;
    if (!toData) throw new Error("runComputeds: a list computed needs `toData` (or a `project`)");
    return (raw as readonly Entity[]).map((entity) => toData(config.store(db), entity));
  };
  const covered = new Set<string>();
  const conforms: ComputedConforms<Db> = (name, cconfig) => {
    covered.add(name);
    const project = cconfig.project ?? hydrateEntities;
    describe(`${name} computed conforms`, () => {
      for (const testCase of cconfig.cases) {
        it(testCase.name, () => {
          const db = config.makeDb();
          // Runtime invariant: a derivation's `input` is authored as a full State.
          config.fromState(config.store(db), testCase.input as State);
          const raw = readComputed(cconfig.computed(db));
          assert(project(raw, db), testCase.value, config.match);
        });
      }
    });
  };
  config.define(conforms);
  describe("computed conformance coverage", () => {
    for (const [path, module] of Object.entries(config.derivationModules)) {
      if (!isDerivationModule(module)) continue;
      const name = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
      it(`${name} has a computed conformance case`, () => {
        if (!covered.has(name)) throw new Error(`${name} has no computed conformance case`);
      });
    }
  });
};
