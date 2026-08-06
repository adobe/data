// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database, Entity } from "@adobe/data/ecs";
import type { Observe } from "@adobe/data/observe";
import type { State } from "../../../data/state/state.js";
import type { DerivationCase } from "../../../data/state/conformance-case.js";
import { expectMatches } from "../../../data/state/expect-state-matches.js";
import { FeatureDatabase } from "../feature-database.js";
import { fromState } from "./from-state.js";
import { toData } from "./to-data.js";
import { visibleTodos } from "../computed-database/computed/visible-todos.js";
import { cases as visibleTodosCases } from "../../../data/state/visible-todos.js";

// Each derivation's cases run against its same-named ecs computed. A computed is
// an `Observe`, so after seeding the store we read its synchronous emission. ecs
// list-computeds are entity-id based, so by default we hydrate the output into
// `data/` values through the feature's per-entity `toData` (the same projection
// `toState` uses) — so an id-based computed like `visibleTodos` needs no adapter.
// This is the computed analog of the transaction/action runners.
const makeDb = () => Database.toSystemDatabase(Database.create(FeatureDatabase.plugin));
type Db = ReturnType<typeof makeDb>;

// The default projection: hydrate a computed's entity-id list into the value
// shape a derivation yields. Override only for a computed whose output is not a
// list of entities (a scalar, a single entity, a nested shape).
const hydrateEntities = (raw: unknown, db: Db): unknown =>
  (raw as readonly Entity[]).map((entity) => toData(db.store, entity));

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

const covered = new Set<string>();
const conformsComputed = <Value>(
  name: string,
  config: {
    readonly cases: readonly DerivationCase<unknown, Value>[];
    readonly computed: (db: Db) => Observe<unknown>;
    readonly project?: (raw: unknown, db: Db) => unknown;
  },
): void => {
  covered.add(name);
  const project = config.project ?? hydrateEntities;
  describe(`${name} computed conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, () => {
        const db = makeDb();
        // Runtime invariant: a derivation's `input` is authored as a full State.
        fromState(db.store, testCase.input as State);
        const raw = readComputed(config.computed(db));
        expectMatches(project(raw, db), testCase.value);
      });
    }
  });
};

// An id-based list computed needs no adapter — the default `hydrateEntities`
// projection reads each entity through `toData`.
conformsComputed("visibleTodos", { cases: visibleTodosCases, computed: visibleTodos });

// None-missed guard: every data/state derivation (a file whose `cases` are
// `{ input, value }`) must be wired above.
const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const derivationModules = import.meta.glob<Record<string, unknown>>(
  ["../../../data/state/*.ts", "!../../../data/state/*.test.ts", "!../../../data/state/*.type-test.ts"],
  { eager: true },
);
describe("computed conformance coverage", () => {
  for (const [path, module] of Object.entries(derivationModules)) {
    const cases = module["cases"];
    const isDerivation =
      Array.isArray(cases) &&
      cases.length > 0 &&
      typeof cases[0] === "object" &&
      cases[0] !== null &&
      "value" in cases[0];
    if (!isDerivation) continue;
    const name = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
    it(`${name} has a computed conformance case`, () => expect(covered.has(name)).toBe(true));
  }
});
