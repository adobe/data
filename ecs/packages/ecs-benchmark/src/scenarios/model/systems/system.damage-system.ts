// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damage } from "../shared/component.damage.js";
import { health } from "../shared/component.health.js";
import { healthSystem } from "./system.health-system.js";

/** `DamageSystem`: health takes `atk - def` while both are positive. */
export const damageSystem: System = System.create({ kernel: true, components: { with: [health, damage] }, after: [healthSystem] }, row => {
    const value = row[health];
    const { atk, def } = row[damage];
    const total = atk - def;
    if (value.hp > 0 && total > 0) row[health] = { hp: Math.max(value.hp - total, 0), maxhp: value.maxhp, status: value.status };
});
