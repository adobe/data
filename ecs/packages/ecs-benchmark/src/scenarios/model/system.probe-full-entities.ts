// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { data } from "./shared/component.data.js";
import { position } from "./shared/component.position.js";
import { target } from "./shared/component.target.js";
import { velocity } from "./shared/component.velocity.js";

/** The vector of entities `createEntitiesWithHalfComponents` fills: a probe for each entity with all three components. */
export const probeFullEntities: System = System.create({ kernel: true, components: { with: [position, velocity, data] } }, (row, { commands }) => {
    commands.spawn([target])({ [target]: row.entity });
});
