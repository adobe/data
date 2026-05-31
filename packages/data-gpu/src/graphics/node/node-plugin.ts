// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Aabb, Mat4x4, Quat, Vec3 } from "@adobe/data/math";
import { True } from "@adobe/data/schema";

/**
 * The transform-hierarchy core model. Every entity with a position in the
 * world is a `Node` — see `node.ts` for the field bundle.
 *
 * `_worldMatrix` is declared as a component but NOT listed on the authored
 * Node archetype — the `transform` system writes it via `db.store.update`,
 * which migrates each entity once into a wider archetype that includes it.
 * Renderers query for that post-migration archetype.
 */
export const plugin = Database.Plugin.create({
    components: {
        visible:      True.schema,
        position:     Vec3.schema,
        rotation:     Quat.schema,
        scale:        Vec3.schema,
        parent:       Entity.schema,
        pickable:     True.schema,
        _worldMatrix: Mat4x4.schema,
        _worldBounds: Aabb.schema,
    },
    archetypes: {
        Node: ["position", "rotation", "scale", "parent", "visible"],
    },
});
