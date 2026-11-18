// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { damage, data, health, player, position, sprite, target, velocity } from "../../../../../model/index.js";
import { gpuData } from "../../../../gpu/model/index.js";

/** Despawns every entity the benchmarks make, each of which holds one of the suite's components or more. */
export const clearEntities: System = System.create({}, ({ commands }) => {
    for (const component of [position, velocity, data, gpuData, health, damage, sprite, player, target] as const) commands.despawnWhere({ with: [component] });
});
