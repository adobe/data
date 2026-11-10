// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "../shared/component.position.js";
import { velocity } from "../shared/component.velocity.js";
import { removePosition } from "./system.remove-position.js";

/** `addComponentOne`, a default position, for each entity `removePosition` took it from. */
export const addPosition: System = System.create({ kernel: true, components: { with: [velocity], not: [position] }, after: [removePosition] }, (row, { commands }) => {
    commands.add(row.entity, position, { x: 0, y: 0 });
});
