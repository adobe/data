// © 2026 Adobe. MIT License. See /LICENSE for details.

// Which sprite a rendered entity is. A pure, serializable value; the texture
// URL each kind maps to is a presentation concern and lives in `ui/`.
export type SpriteKind = "bunny" | "fox";
export * as SpriteKind from "./public.js";
