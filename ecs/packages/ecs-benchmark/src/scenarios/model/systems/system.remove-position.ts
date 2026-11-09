// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";

/** `removeComponentOne` for each entity with components one and two. */
export const removePosition: System = System.create({ kernel: true, components: { with: [position, velocity] } }, (row, { commands }) => {
    commands.remove(row.entity, position);
});
