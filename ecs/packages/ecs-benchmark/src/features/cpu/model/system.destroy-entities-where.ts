// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { position, velocity } from "../../../model/index.js";

/** Every entity `createMinimal` made, despawned by one query rather than a `destroy` each, which the suite doesn't time. */
export const destroyEntitiesWhere: System = System.create({}, ({ commands }) => {
    commands.despawnWhere({ with: [position, velocity] });
});
