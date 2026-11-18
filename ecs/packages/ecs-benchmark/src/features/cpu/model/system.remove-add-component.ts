// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position, velocity } from "../../../model/index.js";

/** `removeComponentOne` for each entity with components one and two. */
const removePosition: System = System.create({ kernel: true, components: { with: [position, velocity] } }, (row, { commands }) => {
    commands.remove(row.entity, position);
});

/** `addComponentOne`, a default position, for each entity `removePosition` took it from. */
const addPosition: System = System.create({ kernel: true, components: { with: [velocity], not: [position] }, after: [removePosition] }, (row, { commands }) => {
    commands.add(row.entity, position, { x: 0, y: 0 });
});

/** `BM_RemoveAddComponent`: component one removed from each entity, then added back, each at a sync point. */
export const removeAddComponent: System = System.create([removePosition, addPosition]);
