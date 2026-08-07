// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const setSpriteHovered = (
  t: CoreDatabase.Store,
  args: { readonly id: Entity; readonly hovered: boolean },
) => {
  if (t.read(args.id)) {
    t.update(args.id, { hovered: args.hovered });
  }
};
