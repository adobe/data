// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "./shared/component.position.js";
import { target } from "./shared/component.target.js";
import { velocity } from "./shared/component.velocity.js";

/** The vector of entities `createEntitiesWithMinimalComponents` fills: a probe for each entity with components one and two. */
export const probeEntities: System = System.create({ kernel: true, components: { with: [position, velocity] } }, (row, { commands }) => {
    commands.spawn([target])({ [target]: row.entity });
});
