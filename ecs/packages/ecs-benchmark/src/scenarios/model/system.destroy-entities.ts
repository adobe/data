// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position } from "./shared/component.position.js";
import { velocity } from "./shared/component.velocity.js";

/** `BM_DestroyEntities`: `destroy` for each entity `createMinimal` made. */
export const destroyEntities: System = System.create({ kernel: true, components: { with: [position, velocity] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
