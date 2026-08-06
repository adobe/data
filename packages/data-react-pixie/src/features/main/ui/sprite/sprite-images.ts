// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { SpriteKind } from "../../data/sprite-kind/sprite-kind.js";
import bunnyUrl from "./bunny.png";
import foxUrl from "./fox.png";

// Presentation-only mapping from a sprite kind to its texture URL. The bundler
// resolves each `.png` import to an asset URL. Lives in `ui/` because the URLs
// are a rendering concern, not part of the serializable data model.
export const spriteImages = {
  bunny: bunnyUrl,
  fox: foxUrl,
} as const satisfies Record<SpriteKind, string>;
