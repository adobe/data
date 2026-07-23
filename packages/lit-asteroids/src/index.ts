// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for lit-asteroids.
// Consumers import from this barrel to build their own database or render the UI.

import { SystemDatabase } from "./features/main/ecs/system-database/system-database.js";

export { SystemDatabase } from "./features/main/ecs/system-database/system-database.js";

/**
 * The base asteroids plugin (schema + indexes + transactions + computed,
 * combined with the built-in rAF scheduler). Kept as a value export for
 * consumers that build their own database from it.
 */
export const asteroidsPlugin = SystemDatabase.plugin;

export { Asteroids } from "./features/main/ui/asteroids/asteroids.js";
export { AsteroidsElement } from "./features/main/ui/asteroids/asteroids-element.js";

export { State } from "./features/main/data/state/state.js";
export { Ship } from "./features/main/data/ship/ship.js";
export { Asteroid } from "./features/main/data/asteroid/asteroid.js";
export { Bullet } from "./features/main/data/bullet/bullet.js";
export { Input } from "./features/main/data/input/input.js";
export { Size } from "./features/main/data/size/size.js";
