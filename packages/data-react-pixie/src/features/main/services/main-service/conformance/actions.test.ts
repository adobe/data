// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Conformance } from "@adobe/data/testing";
import { MainService } from "../main-service.js";
import * as registeredActions from "../action-database/actions/index.js";
import { createSprite } from "../action-database/actions/create-sprite.js";
import { setFilter } from "../action-database/actions/set-filter.js";
import { setSpriteActive } from "../action-database/actions/set-sprite-active.js";
import { setSpriteHovered } from "../action-database/actions/set-sprite-hovered.js";
import { toggleSpriteActive } from "../action-database/actions/toggle-sprite-active.js";
import { tick } from "../action-database/actions/tick.js";
import { cases as createSpriteCases } from "../../../data/state/create-sprite.js";
import { cases as setFilterCases } from "../../../data/state/set-filter.js";
import { cases as setSpriteActiveCases } from "../../../data/state/set-sprite-active.js";
import { cases as setSpriteHoveredCases } from "../../../data/state/set-sprite-hovered.js";
import { cases as toggleSpriteActiveCases } from "../../../data/state/toggle-sprite-active.js";
import { cases as tickCases } from "../../../data/state/tick.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";

// Each transition's cases run against its same-named ecs action. `runActions`
// splits the case's injected services into recording overrides (via `makeDb`),
// runs the action, then asserts both the resulting state and the declared effects;
// the harness/coverage are shared. This feature injects no services, so the
// `{ services }` override is always empty — the runner shape stays identical to
// the multi-service reference.
Conformance.runActions({
  // `toSystemDatabase` exposes the writable `.store` the projection needs. The
  // feature declares no injected services, so `Record<string, object>` is
  // assignable to the (empty) services override without a cast.
  makeDb: (services) =>
    Database.toSystemDatabase(
      Database.create(MainService.plugin, { services }),
    ),
  store: (db) => db.store,
  fromState,
  toState,
  registered: registeredActions,
  define: (conforms) => {
    conforms("createSprite", {
      cases: createSpriteCases,
      run: (db, input) =>
        createSprite(db, {
          position: input.position ?? [0, 0],
          rotation: input.rotation,
          kind: input.kind ?? "bunny",
        }),
    });
    conforms("setFilter", {
      cases: setFilterCases,
      run: (db, input) => setFilter(db, { filter: input.filter ?? "none" }),
    });
    conforms("setSpriteActive", {
      cases: setSpriteActiveCases,
      run: (db, input, resolve) =>
        setSpriteActive(db, {
          entity: resolve(input.id ?? -1),
          active: input.active ?? false,
        }),
    });
    conforms("setSpriteHovered", {
      cases: setSpriteHoveredCases,
      run: (db, input, resolve) =>
        setSpriteHovered(db, {
          entity: resolve(input.id ?? -1),
          hovered: input.hovered ?? false,
        }),
    });
    conforms("toggleSpriteActive", {
      cases: toggleSpriteActiveCases,
      run: (db, input, resolve) =>
        toggleSpriteActive(db, resolve(input.id ?? -1)),
    });
    conforms("tick", {
      cases: tickCases,
      run: (db, input) => tick(db, { delta: input.delta ?? 0 }),
    });
  },
});
