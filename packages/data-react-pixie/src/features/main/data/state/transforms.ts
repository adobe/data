// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform the spec verifies,
// and nothing else (helpers like `create` and `samples` are deliberately absent).
// Its keys ARE the conformance surface: the manifest's coverage guard
// (`Conformance.feature`) requires exactly one `*.cases.ts` module per key here, so
// adding a transform without cases — or cases without a transform — fails to compile.
// This is a per-feature, local barrel (not a cross-feature registry), authored where
// the transforms live.
export { createSprite } from "./create-sprite.js";
export { setSpriteHovered } from "./set-sprite-hovered.js";
export { setSpriteActive } from "./set-sprite-active.js";
export { toggleSpriteActive } from "./toggle-sprite-active.js";
export { tick } from "./tick.js";
export { setFilter } from "./set-filter.js";
