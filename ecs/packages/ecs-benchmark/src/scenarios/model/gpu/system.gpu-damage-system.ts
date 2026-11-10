// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damage } from "../shared/component.damage.js";
import { health } from "../shared/component.health.js";
import { gpuHealthSystem } from "./system.gpu-health-system.js";

/** `DamageSystem` as a GPU kernel: health takes `atk - def` while both are positive. */
export const gpuDamageSystem: System = System.create({ kernel: "gpu", components: { with: [health, damage] }, after: [gpuHealthSystem] }, row => {
    const value = row[health];
    const { atk, def } = row[damage];
    const total = atk - def;
    if (value.hp > 0 && total > 0) row[health] = { hp: Math.max(value.hp - total, 0), maxhp: value.maxhp, status: value.status };
});
