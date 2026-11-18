// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damageSystem } from "./internal/system.damage-system.js";
import { dataSystem } from "./internal/system.data-system.js";
import { healthSystem } from "./internal/system.health-system.js";
import { moreComplexSystem } from "./internal/system.more-complex-system.js";
import { movementSystem } from "./internal/system.movement-system.js";
import { renderSystem } from "./internal/system.render-system.js";
import { spriteSystem } from "./internal/system.sprite-system.js";

/**
 * A frame of the suite's `BM_ComplexSystemsUpdate`: its seven systems, each after those it lists before it whose
 * components it shares.
 */
export const complexSystemsUpdate: System = System.create([movementSystem, dataSystem, moreComplexSystem, healthSystem, damageSystem, spriteSystem, renderSystem]);
