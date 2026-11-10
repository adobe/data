// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { damageSystem } from "./systems/system.damage-system.js";
import { dataSystem } from "./systems/system.data-system.js";
import { healthSystem } from "./systems/system.health-system.js";
import { moreComplexSystem } from "./systems/system.more-complex-system.js";
import { movementSystem } from "./systems/system.movement-system.js";
import { renderSystem } from "./systems/system.render-system.js";
import { spriteSystem } from "./systems/system.sprite-system.js";

/** The seven systems of `BM_ComplexSystemsUpdate`, by their names in the suite, in the order a frame runs them. */
export const complexSystems: readonly (readonly [string, System])[] = [
    ["MovementSystem", movementSystem], ["DataSystem", dataSystem], ["MoreComplexSystem", moreComplexSystem], ["HealthSystem", healthSystem],
    ["DamageSystem", damageSystem], ["SpriteSystem", spriteSystem], ["RenderSystem", renderSystem],
];
