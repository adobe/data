// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position, target, velocity } from "../../../model/index.js";

/** The vector of entities `createEntitiesWithMinimalComponents` fills: a probe for each entity with components one and two. */
export const probeEntities: System = System.create({ kernel: true, components: { with: [position, velocity] } }, (row, { commands }) => {
    commands.spawn([target])({ [target]: row.entity });
});
