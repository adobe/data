// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { gpuData } from "./gpu/component.gpu-data.js";
import { damage } from "./shared/component.damage.js";
import { data } from "./shared/component.data.js";
import { health } from "./shared/component.health.js";
import { player } from "./shared/component.player.js";
import { position } from "./shared/component.position.js";
import { sprite } from "./shared/component.sprite.js";
import { target } from "./shared/component.target.js";
import { velocity } from "./shared/component.velocity.js";

/** Despawns every entity the benchmarks make, each of which holds one of the suite's components or more. */
export const clearEntities: System = System.create({}, ({ commands }) => {
    for (const component of [position, velocity, data, gpuData, health, damage, sprite, player, target] as const) commands.despawnWhere({ with: [component] });
});
