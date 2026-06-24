// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Quat, type Vec3 } from "@adobe/data/math";
import { Node } from "../node/node.js";

/**
 * Authored renderable scene. A `Geometry` is an asset identified by URL; a
 * `Model` is a placed instance of a Geometry — a Node plus a reference to
 * the Geometry it draws.
 *
 * Loading is performed by `modelLoader`, which reads the `modelUrl` and
 * produces the GPU primitives the renderers consume.
 */
export const model = Database.Plugin.create({
    extends: Node.plugin,
    components: {
        modelUrl: { type: "string" },
        geometry: Entity.schema,
    },
    archetypes: {
        Geometry: ["modelUrl"],
        Model:    ["geometry", "position", "rotation", "scale", "visible", "parent"],
    },
    transactions: {
        insertGeometry(t, args: { modelUrl: string }): number {
            return t.archetypes.Geometry.insert({ modelUrl: args.modelUrl });
        },
        insertModel(t, args: {
            geometry: number;
            position?: Vec3;
            rotation?: Quat;
            scale?: Vec3;
            parent?: number;
        }): number {
            return t.archetypes.Model.insert({
                geometry: args.geometry,
                position: args.position ?? [0, 0, 0],
                rotation: args.rotation ?? Quat.identity,
                scale:    args.scale    ?? [1, 1, 1],
                visible:  true,
                parent:   args.parent   ?? 0,
            });
        },
    },
});
