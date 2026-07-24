// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for space-rock-game.
// Consumers import from this barrel to build their own database or render the UI.

// The assembled Space Rock Game feature database, feature-qualified for external
// consumers (per the cross-feature naming rule). Carries `.plugin` (schema +
// indexes + transactions + computed, combined with the built-in rAF scheduler)
// and `.Store` for consumers that build their own database from it.
export { FeatureDatabase as SpaceRockGameDatabase } from "./features/main/ecs/feature-database.js";

export { SpaceRockGame } from "./features/main/ui/space-rock-game/space-rock-game.js";
export { SpaceRockGameElement } from "./features/main/ui/space-rock-game/space-rock-game-element.js";

export { State } from "./features/main/data/state/state.js";
export { Ship } from "./features/main/data/ship/ship.js";
export { Asteroid } from "./features/main/data/asteroid/asteroid.js";
export { Bullet } from "./features/main/data/bullet/bullet.js";
export { Input } from "./features/main/data/input/input.js";
export { Size } from "./features/main/data/size/size.js";
