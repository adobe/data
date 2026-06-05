// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { Vec3, Quat, Mat4x4 } from "@adobe/data/math";
import { physicsData } from "../../physics/physics-data-plugin.js";
import { fitBoneCapsules } from "../../physics/ragdoll/fit-bone-capsules.js";
import { pbrSkinning } from "./skinning/skinning-plugin.js";
import { modelLoader } from "../scene/model/model-loader-plugin.js";
import { transform } from "../scene/node/transform-plugin.js";

/**
 * boneColliders — fits a capsule to each bone of a skinned model and makes the
 * capsules *track the animated skeleton* (ragdoll step 1). Once a skeleton's skin
 * has loaded, `fitBoneCapsules` produces a per-bone capsule (bone-local offset +
 * dims); we spawn one **kinematic** capsule body per bone and, each frame, drive
 * it to `jointWorldMatrix · offset` — so the capsules follow the walk/animation
 * and collide with the world. Flipping them to `dynamic` (+ joints) is the next
 * step (the ragdoll controller); for now they are the live, animation-driven
 * collision proxy. Rendered (debug) via the physics bridge's capsule mesh.
 */

/** Orthonormalised rotation of a column-major matrix, as a quaternion. */
function rotationOf(m: Mat4x4): Quat {
    let m00 = m[0], m10 = m[1], m20 = m[2], m01 = m[4], m11 = m[5], m21 = m[6], m02 = m[8], m12 = m[9], m22 = m[10];
    const sx = Math.hypot(m00, m10, m20) || 1, sy = Math.hypot(m01, m11, m21) || 1, sz = Math.hypot(m02, m12, m22) || 1;
    m00 /= sx; m10 /= sx; m20 /= sx; m01 /= sy; m11 /= sy; m21 /= sy; m02 /= sz; m12 /= sz; m22 /= sz;
    const tr = m00 + m11 + m22;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
    if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

interface SkinGeometry { _cpuSkin?: { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null; _skinInverseBindMatrices?: Float32Array | null }

export const boneColliders = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, pbrSkinning, modelLoader, transform),
    components: {
        _boneJoint: Entity.schema, // the skeleton joint this capsule tracks
        _boneOffsetPos: Vec3.schema,     // capsule offset in the bone's bind-local frame
        _boneOffsetRot: Quat.schema,
        _ragdollBuilt: True.schema,      // tag: this skeleton's bone capsules have been generated
    },
    archetypes: {
        // a kinematic capsule body bound to a skeleton joint (collisionGroup 1 ⇒ the
        // ragdoll's bones never collide with each other, only the world)
        BoneCapsule: ["bodyType", "colliderShape", "halfExtents", "material", "collisionGroup", "position", "rotation", "linearVelocity", "angularVelocity", "_boneJoint", "_boneOffsetPos", "_boneOffsetRot"],
    },
    systems: {
        // Once a skeleton's skin has loaded, fit + spawn its bone capsules (one-time;
        // tag + exclude). Tail→head since tagging the skeleton migrates its row.
        generateBoneColliders: {
            schedule: { during: ["postUpdate"] },
            create: db => () => {
                const material = (Object.values(db.store.resources.materials)[0] as Entity | undefined) ?? (0 as Entity);
                for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonGeometry"], { exclude: ["_ragdollBuilt"] })) {
                    const ids = arch.columns.id, jc = arch.columns._skeletonJoints, gc = arch.columns._skeletonGeometry;
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const skeleton = ids.get(i), joints = jc.get(i), geo = gc.get(i);
                        const g = db.store.read(geo) as SkinGeometry | null;
                        if (!g?._cpuSkin || !g._skinInverseBindMatrices) continue; // skin not loaded yet
                        for (const c of fitBoneCapsules({ jointCount: joints.length, inverseBindMatrices: g._skinInverseBindMatrices, skin: g._cpuSkin })) {
                            db.store.archetypes.BoneCapsule.insert({
                                bodyType: "kinematic", colliderShape: "capsule", halfExtents: [c.radius, c.halfHeight, 0], material, collisionGroup: 1,
                                position: [0, 0, 0], rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
                                _boneJoint: joints[c.jointIndex], _boneOffsetPos: c.offsetPosition, _boneOffsetRot: c.offsetRotation,
                            });
                        }
                        db.store.update(skeleton, { _ragdollBuilt: true });
                    }
                }
            },
        },
        // Each frame, place every bone capsule at jointWorldMatrix · offset (the
        // kinematic solver then drives the engine body there).
        trackBoneColliders: {
            schedule: { during: ["postUpdate"], after: ["generateBoneColliders", "transformSystem"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(["_boneJoint", "_boneOffsetPos", "_boneOffsetRot", "position", "rotation"])) {
                    const bj = arch.columns._boneJoint, op = arch.columns._boneOffsetPos, orot = arch.columns._boneOffsetRot;
                    const posCol = arch.columns.position, rotCol = arch.columns.rotation;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const jw = db.store.get(bj.get(i), "_worldMatrix") as Mat4x4 | undefined;
                        if (!jw) continue;
                        posCol.set(i, Mat4x4.multiplyVec3(jw, op.get(i)));
                        rotCol.set(i, Quat.multiply(rotationOf(jw), orot.get(i)));
                    }
                }
            },
        },
    },
});
