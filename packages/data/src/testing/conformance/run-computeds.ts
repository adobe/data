// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Observe } from "../../observe/index.js";
import type { Entity } from "../../ecs/entity/entity.js";
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { discoverDerivations, discoverOps } from "./discover.js";

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

// Auto-pairing config: discover derivations and the registered computeds, pair by
// name, and conform each — no per-item wiring. A computed with no same-named
// derivation is skipped (single-`data/<type>` math is covered by that helper's own
// test). The comparison is identity by default; a computed that emits an entity-id
// list names itself in `hydrate` so the runner maps each id through `toData` into
// the value shape the derivation yields.
export interface ComputedRunConfig<Db, Store, State> {
  readonly makeDb: () => Db;
  readonly store: (db: Db) => Store;
  readonly fromState: (store: Store, input: State) => unknown;
  readonly toData?: (store: Store, entity: Entity) => unknown;
  readonly derivations: Record<string, Record<string, unknown>>;
  readonly computeds: Record<string, unknown>;
  readonly hydrate?: readonly string[];
  // The feature's default `State`; each case's `input` is merged over it before
  // seeding, so a derivation case names only the fields it reads.
  readonly initial?: State;
  readonly match?: MatchOptions;
}

// The single conformance test for every ecs computed backing a `data/state`
// derivation. Build `makeDb` from the `ComputedDatabase` layer (not the assembled
// db): a behaviour layer above may `withCache` a pre-seed value that a direct
// `fromState` seed cannot invalidate.
export function runComputeds<Db, Store, State>(config: ComputedRunConfig<Db, Store, State>): void {
  const derivations = discoverDerivations(config.derivations);
  const hydrate = new Set(config.hydrate ?? []);
  for (const [name, computed] of discoverOps(config.computeds)) {
    const paired = derivations.get(name);
    if (!paired) continue; // computed with no `state/` derivation — covered by its data/<type> helper
    describe(`${name} computed conforms`, () => {
      for (const testCase of paired.cases) {
        it(testCase.name as string, () => {
          const db = config.makeDb();
          const input = { ...(config.initial ?? {}), ...(testCase.input as object) } as State;
          config.fromState(config.store(db), input);
          const raw = readComputed((computed as (d: Db) => Observe<unknown>)(db));
          const value =
            hydrate.has(name) && config.toData
              ? (raw as readonly Entity[]).map((e) => config.toData!(config.store(db), e))
              : raw;
          assert(value, testCase.value, config.match);
        });
      }
    });
  }
}
