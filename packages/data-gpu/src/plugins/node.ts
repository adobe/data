// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat, Vec3 } from "@adobe/data/math";
import { True } from "@adobe/data/schema";

export const node = Database.Plugin.create({
    components: {
        visible: True.schema,
        position: Vec3.schema,
        rotation: Quat.schema,
        scale: Vec3.schema,
        parent: { default: 0 as number },
    },
    archetypes: {
        Node: ["position", "rotation", "scale", "parent", "visible"],
    },
});
