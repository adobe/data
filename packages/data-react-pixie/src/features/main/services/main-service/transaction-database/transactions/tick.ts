// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";

// Advance one animation frame: every sprite rotates by `delta * 0.1`. Mirrors
// the pure `State.tick` transform (conformed in tick.test.ts).
export const tick = (t: CoreDatabase.Store, args: { readonly delta: number }) => {
  for (const entity of t.select(t.archetypes.Sprite.components)) {
    const sprite = t.read(entity);
    if (sprite?.rotation !== undefined) {
      t.update(entity, { rotation: sprite.rotation + args.delta * 0.1 });
    }
  }
};
