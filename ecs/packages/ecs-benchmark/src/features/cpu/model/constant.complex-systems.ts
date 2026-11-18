// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { damageSystem } from "./internal/system.damage-system.js";
import { dataSystem } from "./internal/system.data-system.js";
import { healthSystem } from "./internal/system.health-system.js";
import { moreComplexSystem } from "./internal/system.more-complex-system.js";
import { movementSystem } from "./internal/system.movement-system.js";
import { renderSystem } from "./internal/system.render-system.js";
import { spriteSystem } from "./internal/system.sprite-system.js";

/** The seven systems of `BM_ComplexSystemsUpdate`, by their names in the suite, in the order a frame runs them. */
export const complexSystems: readonly (readonly [string, System])[] = [
    ["MovementSystem", movementSystem], ["DataSystem", dataSystem], ["MoreComplexSystem", moreComplexSystem], ["HealthSystem", healthSystem],
    ["DamageSystem", damageSystem], ["SpriteSystem", spriteSystem], ["RenderSystem", renderSystem],
];
