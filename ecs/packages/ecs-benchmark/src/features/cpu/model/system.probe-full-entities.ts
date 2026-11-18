// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data, position, target, velocity } from "../../../model/index.js";

/** The vector of entities `createEntitiesWithHalfComponents` fills: a probe for each entity with all three components. */
export const probeFullEntities: System = System.create({ kernel: true, components: { with: [position, velocity, data] } }, (row, { commands }) => {
    commands.spawn([target])({ [target]: row.entity });
});
