// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { Database, Entity } from "@adobe/data/ecs";
import type { ConformanceCase } from "../../../data/state/conformance-case.js";
import { splitAndRecordServices, expectEffects } from "../../../data/state/record-effects.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { MainService } from "../main-service.js";
import { fromState } from "./from-state.js";
import { toState } from "./to-state.js";
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

// Each transition's cases run against its same-named ecs **action** (the async
// realization). The case's service args (this feature injects none) become the
// db's service overrides — wrapped so their calls are recorded — the plain args
// drive the action, and we assert both the resulting state and the declared side
// effects. `toSystemDatabase` exposes the writable `.store` the projection needs
// while keeping transactions/actions. The `{ services }` override is used
// uniformly even though it is empty here, keeping the runner shape identical to
// the multi-service reference.
const makeDb = (services: Record<string, object>) =>
  Database.toSystemDatabase(Database.create(MainService.plugin, { services }));
type Db = ReturnType<typeof makeDb>;
type Run<Args> = (db: Db, input: Args, resolve: (specId: number) => Entity) => Promise<void> | void;

const covered = new Set<string>();
const conformsAction = <Args>(
  action: string,
  config: { readonly cases: readonly ConformanceCase<Args>[]; readonly run: Run<Partial<Args>> },
): void => {
  covered.add(action);
  describe(`${action} action conforms`, () => {
    for (const testCase of config.cases) {
      it(testCase.name, async () => {
        const { services, input, calls } = splitAndRecordServices(testCase.args);
        const db = makeDb(services);
        const entities = fromState(db.store, testCase.before);
        const bySpecId = new Map(testCase.before.sprites.map((sprite, i) => [sprite.id, entities[i]]));
        const resolve = (specId: number): Entity => bySpecId.get(specId) ?? Entity.none;
        await config.run(db, input as Partial<Args>, resolve);
        expectStateMatches(toState(db.store), testCase.after);
        expectEffects(calls, testCase.effects);
      });
    }
  });
};

conformsAction("createSprite", {
  cases: createSpriteCases,
  run: (db, input) =>
    createSprite(db, { position: input.position ?? [0, 0], rotation: input.rotation, kind: input.kind ?? "bunny" }),
});
conformsAction("setFilter", {
  cases: setFilterCases,
  run: (db, input) => setFilter(db, { filter: input.filter ?? "none" }),
});
conformsAction("setSpriteActive", {
  cases: setSpriteActiveCases,
  run: (db, input, resolve) =>
    setSpriteActive(db, { entity: resolve(input.id ?? -1), active: input.active ?? false }),
});
conformsAction("setSpriteHovered", {
  cases: setSpriteHoveredCases,
  run: (db, input, resolve) =>
    setSpriteHovered(db, { entity: resolve(input.id ?? -1), hovered: input.hovered ?? false }),
});
conformsAction("toggleSpriteActive", {
  cases: toggleSpriteActiveCases,
  run: (db, input, resolve) => toggleSpriteActive(db, resolve(input.id ?? -1)),
});
conformsAction("tick", {
  cases: tickCases,
  run: (db, input) => tick(db, { delta: input.delta ?? 0 }),
});

// None-missed guard: every action file must be wired above.
const kebabToCamel = (name: string): string =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
describe("action conformance coverage", () => {
  const files = import.meta.glob([
    "../action-database/actions/*.ts",
    "!../action-database/actions/index.ts",
  ]);
  for (const path of Object.keys(files)) {
    const action = kebabToCamel(path.replace(/.*\//, "").replace(/\.ts$/, ""));
    it(`${action} has a conformance case`, () => expect(covered.has(action)).toBe(true));
  }
});
