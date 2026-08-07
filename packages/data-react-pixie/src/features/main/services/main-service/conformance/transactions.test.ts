// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import type { CoreDatabase } from "../core-database/core-database.js";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { expectConforms, type ResolveEntity } from "./expect-conforms.js";
import * as registeredTransactions from "../transaction-database/transactions/index.js";
import { createSprite } from "../transaction-database/transactions/create-sprite.js";
import { setFilter } from "../transaction-database/transactions/set-filter.js";
import { setSpriteActive } from "../transaction-database/transactions/set-sprite-active.js";
import { setSpriteHovered } from "../transaction-database/transactions/set-sprite-hovered.js";
import { toggleSpriteActive } from "../transaction-database/transactions/toggle-sprite-active.js";
import { tick } from "../transaction-database/transactions/tick.js";
import { cases as createSpriteCases } from "../../../data/state/create-sprite.js";
import { cases as setFilterCases } from "../../../data/state/set-filter.js";
import { cases as setSpriteActiveCases } from "../../../data/state/set-sprite-active.js";
import { cases as setSpriteHoveredCases } from "../../../data/state/set-sprite-hovered.js";
import { cases as toggleSpriteActiveCases } from "../../../data/state/toggle-sprite-active.js";
import { cases as tickCases } from "../../../data/state/tick.js";

// The single conformance test for every ecs transaction. Each transaction's
// `apply` is bespoke — an id-addressed transaction resolves its entity via the
// seeded store — and transaction files must stay single-export (the
// `transactions/` barrel is `export *`-ed straight into the plugin facet), so the
// wiring lives here rather than beside each transaction. The guard at the bottom
// asserts every registered transaction is wired below, so none can be missed.
const covered = new Set<string>();
const conforms = <Args>(
  transaction: string,
  config: {
    readonly cases: readonly ConformanceCase<Args>[];
    readonly apply: (t: CoreDatabase.Store, args: Args, resolve: ResolveEntity) => void;
  },
): void => {
  covered.add(transaction);
  describe(`${transaction} transaction conforms`, () => expectConforms(config));
};

conforms("createSprite", { cases: createSpriteCases, apply: createSprite });
conforms("setFilter", { cases: setFilterCases, apply: setFilter });
conforms("setSpriteActive", {
  cases: setSpriteActiveCases,
  apply: (t, args, resolve) => setSpriteActive(t, { entity: resolve(args.id), active: args.active }),
});
conforms("setSpriteHovered", {
  cases: setSpriteHoveredCases,
  apply: (t, args, resolve) => setSpriteHovered(t, { entity: resolve(args.id), hovered: args.hovered }),
});
conforms("toggleSpriteActive", {
  cases: toggleSpriteActiveCases,
  apply: (t, args, resolve) => toggleSpriteActive(t, { entity: resolve(args.id) }),
});
conforms("tick", { cases: tickCases, apply: tick });

// None-missed guard: every **registered** transaction must be wired above. Keyed
// off the barrel (the transactions the plugin actually dispatches), not a file
// glob — so a shared read helper parked flat in `transactions/` (kept out of the
// barrel) is naturally excluded.
describe("transaction conformance coverage", () => {
  for (const transaction of Object.keys(registeredTransactions)) {
    it(`${transaction} has a conformance case`, () => expect(covered.has(transaction)).toBe(true));
  }
});
