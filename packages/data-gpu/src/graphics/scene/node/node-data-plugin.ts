// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Aabb, Mat4x4, Quat, Vec3 } from "@adobe/data/math";
import { True } from "@adobe/data/schema";

/**
 * The transform-hierarchy core model. Every entity with a position in the
 * world is a `Node` — see `node.ts` for the field bundle.
 *
 * `_worldMatrix` and `_worldBounds` are derived components (`nonPersistent: true`)
 * but NOT listed on the authored Node archetype — systems write them via
 * `db.store.update`, migrating each entity once into a wider archetype.
 *
 * `indexes.nodeChildrenOf` lists direct children by parent entity id. Scoped
 * to the Node archetype (and supersets such as Model) — not every column that
 * happens to carry `parent`.
 */
export const nodeData = Database.Plugin.create({
    components: {
        visible:      True.schema,
        position:     Vec3.schema,
        rotation:     Quat.schema,
        scale:        Vec3.schema,
        parent:       Entity.schema,
        _worldMatrix: { ...Mat4x4.schema, nonPersistent: true },
        _worldBounds: { ...Aabb.schema, nonPersistent: true },
    },
    archetypes: {
        Node: ["position", "rotation", "scale", "parent", "visible"],
    },
    indexes: {
        nodeChildrenOf: { key: "parent", archetype: "Node" },
    },
});
