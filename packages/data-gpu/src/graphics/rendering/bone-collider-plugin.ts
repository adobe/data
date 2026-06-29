// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { Vec3, Quat, Mat4x4 } from "@adobe/data/math";
import { physicsData } from "../../physics/physics-data-plugin.js";
import { jointData } from "../../physics/joint/joint-plugin.js";
import { fitBoneCapsules } from "../../physics/ragdoll/fit-bone-capsules.js";
import { ragdollTrigger } from "./ragdoll-trigger-plugin.js";
import { pbrSkinning } from "./skinning/skinning-plugin.js";
import { modelLoader } from "../scene/model/model-loader-plugin.js";
import { transform } from "../scene/node/transform-plugin.js";
import { requireMaterial } from "../../material/require-material.js";

/**
 * boneColliders — fits a capsule to each bone of a skinned model and ragdolls it.
 *
 * **Alive:** once the skin loads, `fitBoneCapsules` gives a per-bone capsule
 * (bone-local offset + dims); we spawn a **kinematic** capsule per bone and each
 * frame drive it to `jointWorldMatrix · offset`, so the capsules track the
 * animation and collide with the world.
 *
 * **Ragdoll** (`triggerRagdoll`): connect each capsule to its nearest
 * capsule-bearing ancestor with a point joint (anchored at the shared joint), flip
 * every capsule kinematic→dynamic, and stop the animation. Now physics drives the
 * capsules; `reconcileRagdoll` writes each bone's pose *back* onto its skeleton
 * joint (world → bone-local), so the skinned mesh goes limp and flops. (Anatomical
 * cone limits + Jolt support are follow-ups; see physics/README.md.)
 */

/** Column-major rigid transform from a position + unit quaternion. */
function compose(p: ArrayLike<number>, q: ArrayLike<number>): Mat4x4 {
    return Mat4x4.multiply(Mat4x4.translation(p[0], p[1], p[2]), Quat.toMat4([q[0], q[1], q[2], q[3]]));
}

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

interface SkinMesh {
    cpuSkin?: { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null;
    skinInverseBindMatrices?: Float32Array | null;
}

export const boneColliders = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, jointData, ragdollTrigger, pbrSkinning, modelLoader, transform),
    components: {
        _boneJoint: { ...Entity.schema, nonPersistent: true }, // the skeleton joint this capsule tracks
        _boneOffsetPos: { ...Vec3.schema, nonPersistent: true },     // capsule offset in the bone's bind-local frame
        _boneOffsetRot: { ...Quat.schema, nonPersistent: true },
        _ragdollBuilt: { ...True.schema, nonPersistent: true },      // tag: this skeleton's bone capsules have been generated
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
                const material = requireMaterial(db, "steel");
                for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonMesh"], { exclude: ["_ragdollBuilt"] })) {
                    const ids = arch.columns.id, jc = arch.columns._skeletonJoints, mc = arch.columns._skeletonMesh;
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const skeleton = ids.get(i), joints = jc.get(i), meshId = mc.get(i);
                        const g = db.store.read(meshId) as SkinMesh | null;
                        if (!g?.cpuSkin || !g.skinInverseBindMatrices) continue;
                        for (const c of fitBoneCapsules({ jointCount: joints.length, inverseBindMatrices: g.skinInverseBindMatrices, skin: g.cpuSkin })) {
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
        // Alive: place every *kinematic* bone capsule at jointWorldMatrix · offset
        // (the solver then kinematic-drives the engine body there). Dynamic capsules
        // are ragdolling — physics owns them, so skip.
        trackBoneColliders: {
            schedule: { during: ["postUpdate"], after: ["generateBoneColliders", "transformSystem"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(["_boneJoint", "_boneOffsetPos", "_boneOffsetRot", "bodyType", "position", "rotation"])) {
                    const bj = arch.columns._boneJoint, op = arch.columns._boneOffsetPos, orot = arch.columns._boneOffsetRot, bt = arch.columns.bodyType;
                    const posCol = arch.columns.position, rotCol = arch.columns.rotation;
                    for (let i = 0; i < arch.rowCount; i++) {
                        if (bt.get(i) === "dynamic") continue; // ragdolling — physics drives it
                        const jw = db.store.get(bj.get(i), "_worldMatrix") as Mat4x4 | undefined;
                        if (!jw) continue;
                        posCol.set(i, Mat4x4.multiplyVec3(jw, op.get(i)));
                        rotCol.set(i, Quat.multiply(rotationOf(jw), orot.get(i)));
                    }
                }
            },
        },
        // On trigger: joint each capsule to its nearest capsule-bearing ancestor (at
        // the shared joint point, anchors from the current pose), flip every capsule
        // to dynamic, and stop the animation. The solver flips the engine bodies and
        // mirrors the joints; the root capsule (no ancestor) falls free, dragging the rest.
        ragdollOnTrigger: {
            schedule: { during: ["postUpdate"], after: ["trackBoneColliders"] },
            create: db => () => {
                if (!db.store.resources._ragdollTrigger) return;
                db.store.resources._ragdollTrigger = false;
                // joint entity → its capsule + current world pose + rotation
                const byJoint = new Map<Entity, { capsule: Entity; world: Mat4x4; rot: Quat }>();
                for (const arch of db.store.queryArchetypes(["_boneJoint", "position", "rotation"])) {
                    const ids = arch.columns.id, bj = arch.columns._boneJoint, pc = arch.columns.position, rc = arch.columns.rotation;
                    for (let i = 0; i < arch.rowCount; i++) { const r = rc.get(i); byJoint.set(bj.get(i), { capsule: ids.get(i), world: compose(pc.get(i), r), rot: r }); }
                }
                for (const arch of db.store.queryArchetypes(["_boneJoint", "position", "rotation"])) {
                    const ids = arch.columns.id, bj = arch.columns._boneJoint, pc = arch.columns.position, rc = arch.columns.rotation;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const joint = bj.get(i);
                        // nearest ancestor joint that has a capsule
                        let pj = (db.store.get(joint, "parent") as Entity | undefined) ?? (0 as Entity);
                        while (pj && !byJoint.has(pj)) pj = (db.store.get(pj, "parent") as Entity | undefined) ?? (0 as Entity);
                        const parent = pj ? byJoint.get(pj) : undefined;
                        if (!parent) continue; // root capsule: unconstrained
                        const jw = db.store.get(joint, "_worldMatrix") as Mat4x4 | undefined;
                        const origin: Vec3 = jw ? [jw[12], jw[13], jw[14]] : [pc.get(i)[0], pc.get(i)[1], pc.get(i)[2]];
                        const childRot = rc.get(i);
                        const childWorld = compose(pc.get(i), childRot);
                        // cone reference = the child bone's current axis (its capsule +Y), in the
                        // parent's frame; the swing-twist joint then limits how far the bone can
                        // deviate from this rest pose — anatomical limits, not a free ball.
                        const boneDirWorld = Quat.rotateVec3(childRot, [0, 1, 0]);
                        const axis = Quat.rotateVec3(Quat.inverse(parent.rot), boneDirWorld);
                        db.store.archetypes.Joint.insert({
                            jointType: "cone", jointBodyA: parent.capsule, jointBodyB: ids.get(i),
                            jointAnchorA: Mat4x4.multiplyVec3(Mat4x4.inverse(parent.world), origin),
                            jointAnchorB: Mat4x4.multiplyVec3(Mat4x4.inverse(childWorld), origin),
                            jointAxis: axis, jointMinLimit: -0.5, jointMaxLimit: 0.5, jointSwingLimit: 0.9, // ~±29° twist, ~52° swing cone
                        });
                    }
                }
                for (const arch of db.store.queryArchetypes(["_boneJoint", "bodyType"])) {
                    const ids = arch.columns.id;
                    for (let i = 0; i < arch.rowCount; i++) db.store.update(ids.get(i), { bodyType: "dynamic" });
                }
                for (const arch of db.store.queryArchetypes(["animationPlaying"])) {
                    const ids = arch.columns.id;
                    for (let i = 0; i < arch.rowCount; i++) db.store.update(ids.get(i), { animationPlaying: false });
                }
            },
        },
        // Ragdolling: write each dynamic bone capsule's pose back onto its skeleton
        // joint as a local TRS (jointWorld = capsuleWorld · offset⁻¹, then relative to
        // the parent's world), so the skinned mesh follows the physics. Two passes so
        // a child uses its parent's *capsule-derived* world, keeping the chain consistent.
        reconcileRagdoll: {
            schedule: { during: ["preRender"], after: ["transformSystem"] },
            create: db => () => {
                const jointWorld = new Map<Entity, Mat4x4>();
                for (const arch of db.store.queryArchetypes(["_boneJoint", "_boneOffsetPos", "_boneOffsetRot", "bodyType", "position", "rotation"])) {
                    const bj = arch.columns._boneJoint, op = arch.columns._boneOffsetPos, orot = arch.columns._boneOffsetRot, bt = arch.columns.bodyType, pc = arch.columns.position, rc = arch.columns.rotation;
                    for (let i = 0; i < arch.rowCount; i++) {
                        if (bt.get(i) !== "dynamic") continue;
                        jointWorld.set(bj.get(i), Mat4x4.multiply(compose(pc.get(i), rc.get(i)), Mat4x4.inverse(compose(op.get(i), orot.get(i)))));
                    }
                }
                if (jointWorld.size === 0) return;
                for (const [joint, jw] of jointWorld) {
                    const parent = (db.store.get(joint, "parent") as Entity | undefined) ?? (0 as Entity);
                    const parentW = jointWorld.get(parent) ?? (parent ? db.store.get(parent, "_worldMatrix") as Mat4x4 | undefined : undefined) ?? Mat4x4.identity;
                    const local = Mat4x4.multiply(Mat4x4.inverse(parentW), jw);
                    db.store.update(joint, { position: [local[12], local[13], local[14]], rotation: rotationOf(local) });
                }
            },
        },
    },
});
