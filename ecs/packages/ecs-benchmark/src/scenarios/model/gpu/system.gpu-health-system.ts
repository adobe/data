// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { health } from "../shared/component.health.js";
import { statusEffect } from "../shared/constant.status-effect.js";

/** `HealthSystem` as a GPU kernel: the dead respawn, the spawned come alive. */
export const gpuHealthSystem: System = System.create({ kernel: "gpu", components: { with: [health] } }, row => {
    const value = row[health];
    if (value.hp <= 0 && value.status !== statusEffect.dead) row[health] = { hp: 0, maxhp: value.maxhp, status: statusEffect.dead };
    else if (value.status === statusEffect.dead && value.hp === 0) row[health] = { hp: value.maxhp, maxhp: value.maxhp, status: statusEffect.spawn };
    else if (value.hp >= value.maxhp && value.status !== statusEffect.alive) row[health] = { hp: value.maxhp, maxhp: value.maxhp, status: statusEffect.alive };
    else row[health] = { hp: value.hp, maxhp: value.maxhp, status: statusEffect.alive };
});
