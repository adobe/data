// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const setSpriteActive = (
  t: CoreDatabase.Store,
  args: { readonly id: Entity; readonly active: boolean },
) => {
  if (t.read(args.id)) {
    t.update(args.id, { active: args.active });
  }
};
