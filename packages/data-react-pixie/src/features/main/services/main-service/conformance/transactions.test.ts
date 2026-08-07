// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data/testing";
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
import { createStore } from "./create-store.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// The single conformance test for every ecs transaction. `runTransactions` owns
// the harness (fresh store, `fromState` seed, `resolve`, `toState` compare,
// coverage guard keyed off the registered barrel); only the bespoke `apply`
// adapters are per-transaction — an id-addressed transaction resolves its entity.
Conformance.runTransactions({
  createStore,
  fromState,
  toState,
  registered: registeredTransactions,
  define: (conforms) => {
    conforms("createSprite", { cases: createSpriteCases, apply: createSprite });
    conforms("setFilter", { cases: setFilterCases, apply: setFilter });
    conforms("setSpriteActive", {
      cases: setSpriteActiveCases,
      apply: (t, args, resolve) =>
        setSpriteActive(t, { entity: resolve(args.id), active: args.active }),
    });
    conforms("setSpriteHovered", {
      cases: setSpriteHoveredCases,
      apply: (t, args, resolve) =>
        setSpriteHovered(t, {
          entity: resolve(args.id),
          hovered: args.hovered,
        }),
    });
    conforms("toggleSpriteActive", {
      cases: toggleSpriteActiveCases,
      apply: (t, args, resolve) =>
        toggleSpriteActive(t, { entity: resolve(args.id) }),
    });
    conforms("tick", { cases: tickCases, apply: tick });
  },
});
