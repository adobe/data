// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damageSystem } from "./systems/system.damage-system.js";
import { dataSystem } from "./systems/system.data-system.js";
import { healthSystem } from "./systems/system.health-system.js";
import { moreComplexSystem } from "./systems/system.more-complex-system.js";
import { movementSystem } from "./systems/system.movement-system.js";
import { renderSystem } from "./systems/system.render-system.js";
import { spriteSystem } from "./systems/system.sprite-system.js";

/**
 * A frame of the suite's `BM_ComplexSystemsUpdate`: its seven systems, each after those it lists before it whose
 * components it shares.
 */
export const complexSystemsUpdate: System = System.create([movementSystem, dataSystem, moreComplexSystem, healthSystem, damageSystem, spriteSystem, renderSystem]);
