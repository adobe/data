// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const toggleSpriteActive = (
  t: CoreDatabase.Store,
  args: { readonly id: Entity },
) => {
  const sprite = t.read(args.id);
  if (sprite && sprite.active !== undefined) {
    t.update(args.id, { active: !sprite.active });
  }
};
