// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Quat, Vec3 } from "@adobe/ecs";
import { instanceOf } from "./component.instance-of.js";
import { parent } from "./component.parent.js";
import { position } from "./component.position.js";
import { rotation } from "./component.rotation.js";
import { scale } from "./component.scale.js";
import { size } from "./component.size.js";
import type { Lookups } from "./type.lookups.js";

/** The transform functions' lookups from a system's, by entity: one of models' `size` and `scale`, one of instances. */
export const lookupsOf = (
    models: (entity: Entity) => { readonly [size]: Vec3; readonly [scale]: Vec3 } | null,
    instances: (entity: Entity) => { readonly [instanceOf]: Entity; readonly [parent]: Entity; readonly [position]: Vec3; readonly [rotation]: Quat } | null,
): Lookups => ({
    model: entity => {
        const row = models(entity);
        return row === null ? null : { size: row[size], scale: row[scale] };
    },
    instance: entity => {
        const row = instances(entity);
        return row === null ? null : { of: row[instanceOf], parent: row[parent], position: row[position], rotation: row[rotation] };
    },
});
