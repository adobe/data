// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { dataSystem } from "./systems/system.data-system.js";
import { movementSystem } from "./systems/system.movement-system.js";

/** A frame of the suite's `BM_SystemsUpdate`: `MovementSystem` and `DataSystem`. */
export const systemsUpdate: System = System.create([movementSystem, dataSystem]);
