// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { Mat4x4, Quat } from "@adobe/data/math";
import { joltSolver, type JoltContext } from "../../physics/solvers/jolt-solver-plugin.js";
import { fitBoneCapsules } from "../../physics/ragdoll/fit-bone-capsules.js";
import { ragdollTrigger } from "./ragdoll-trigger-plugin.js";
import { pbrSkinning } from "./skinning/skinning-plugin.js";
import { modelLoader } from "../scene/model/model-loader-plugin.js";
import { transform } from "../scene/node/transform-plugin.js";
import type { JointTemplate } from "../scene/model/gltf/parse-skin.js";

/**
 * joltRagdoll — a **Jolt-native** ragdoll backend (the alternative to our generic
 * `boneColliders`), using Jolt's `Skeleton` / `RagdollSettings` / `Ragdoll`.
 *
 * Once the skin loads, it builds a `Ragdoll` in the *solver's* physics system: one
 * dynamic body per bone (capsule fitted by `fitBoneCapsules`, tiny sphere for
 * capsule-less joints), a swing-twist constraint to each parent, and
 * `DisableParentChildCollisions`. While alive it `DriveToPoseUsingKinematics`
 * toward the animated pose each frame; on `triggerRagdoll` it stops driving (the
 * bodies fall) and reads the pose back onto the skeleton so the skin flops.
 *
 * Jolt-only by construction — it needs the solver's `PhysicsSystem` (exposed as
 * `_joltContext`). Pair it with `joltSolver`; use `boneColliders` for other solvers.
 */

type Jolt = JoltContext["jolt"];
interface SkinGeo { _cpuSkin?: { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null; _skinInverseBindMatrices?: Float32Array | null; _skinJointTemplate?: JointTemplate[] }

/** Column-major rigid transform from a position + unit quaternion. */
const compose = (px: number, py: number, pz: number, q: ArrayLike<number>): Mat4x4 =>
    Mat4x4.multiply(Mat4x4.translation(px, py, pz), Quat.toMat4([q[0], q[1], q[2], q[3]]));

/** Orthonormalised rotation of a column-major matrix → quaternion. */
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

const SWING = 0.9, TWIST = 0.5; // ~52° swing cone, ~±29° twist

export const joltRagdoll = Database.Plugin.create({
    extends: Database.Plugin.combine(joltSolver, ragdollTrigger, pbrSkinning, modelLoader, transform),
    systems: {
        joltRagdollSystem: {
            schedule: { during: ["postUpdate"], after: ["transformSystem"] },
            create: db => {
                let built = false, dead = false;
                // Jolt objects (created at build): the ragdoll, a reusable pose, scratch.
                let ragdoll: InstanceType<Jolt["Ragdoll"]> | null = null;
                let pose: InstanceType<Jolt["SkeletonPose"]> | null = null;
                let joints: readonly Entity[] = [];
                let modelEntity: Entity = 0 as Entity; // the skeleton's root parent (the Model); moved to follow the ragdoll root when limp
                let tv: InstanceType<Jolt["Vec3"]> | null = null, tq: InstanceType<Jolt["Quat"]> | null = null, troot: InstanceType<Jolt["RVec3"]> | null = null;

                const jointWorld = (j: Entity): Mat4x4 => (db.store.get(j, "_worldMatrix") as Mat4x4 | undefined) ?? Mat4x4.identity;

                const build = (ctx: JoltContext, jointIds: readonly Entity[], g: SkinGeo): void => {
                    const jolt = ctx.jolt, template = g._skinJointTemplate!;
                    const caps = new Map<number, { radius: number; halfHeight: number; offPos: readonly number[]; offRot: readonly number[] }>();
                    for (const c of fitBoneCapsules({ jointCount: jointIds.length, inverseBindMatrices: g._skinInverseBindMatrices!, skin: g._cpuSkin! }))
                        caps.set(c.jointIndex, { radius: c.radius, halfHeight: c.halfHeight, offPos: c.offsetPosition, offRot: c.offsetRotation });

                    const skel = new jolt.Skeleton();
                    for (let i = 0; i < jointIds.length; i++) { const s = new jolt.JPHString(template[i]?.name ?? `j${i}`, (template[i]?.name ?? `j${i}`).length); skel.AddJoint(s, template[i]?.parentJointIndex ?? -1); jolt.destroy(s); }

                    const settings = new jolt.RagdollSettings();
                    settings.mSkeleton = skel;
                    // RagdollPart has no constructor in the IDL — resize the parts vector and
                    // configure each element in place, then write the vector back.
                    const parts = settings.mParts;
                    parts.resize(jointIds.length);
                    for (let i = 0; i < jointIds.length; i++) {
                        const jw = jointWorld(jointIds[i]), cap = caps.get(i);
                        const part = parts.at(i);
                        // body bind pose: capsule sits at jointWorld · offset; sphere at the joint
                        const bodyW = cap ? Mat4x4.multiply(jw, compose(cap.offPos[0], cap.offPos[1], cap.offPos[2], cap.offRot)) : jw;
                        const shp = cap ? new jolt.CapsuleShape(Math.max(cap.halfHeight, 1e-3), cap.radius) : new jolt.SphereShape(0.03);
                        part.SetShape(shp);
                        const bp = new jolt.RVec3(bodyW[12], bodyW[13], bodyW[14]); const br = rotationOf(bodyW); const bq = new jolt.Quat(br[0], br[1], br[2], br[3]);
                        part.set_mPosition(bp); part.set_mRotation(bq);
                        part.set_mMotionType(jolt.EMotionType_Dynamic); part.set_mObjectLayer(ctx.ragdollLayer);
                        const pj = template[i]?.parentJointIndex ?? -1;
                        if (pj >= 0) {
                            // swing-twist to the parent, anchored at this joint, bone axis = parent→this
                            const pw = jointWorld(jointIds[pj]);
                            let ax = jw[12] - pw[12], ay = jw[13] - pw[13], az = jw[14] - pw[14];
                            const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
                            let nx = 0, ny = 0, nz = 0; if (Math.abs(ax) <= Math.abs(ay) && Math.abs(ax) <= Math.abs(az)) { ny = az; nz = -ay; } else { nx = -az; nz = ax; }
                            const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                            const st = new jolt.SwingTwistConstraintSettings();
                            st.mSpace = jolt.EConstraintSpace_WorldSpace;
                            const p1 = new jolt.RVec3(jw[12], jw[13], jw[14]), p2 = new jolt.RVec3(jw[12], jw[13], jw[14]);
                            const t1 = new jolt.Vec3(ax, ay, az), t2 = new jolt.Vec3(ax, ay, az), n1 = new jolt.Vec3(nx, ny, nz), n2 = new jolt.Vec3(nx, ny, nz);
                            st.mPosition1 = p1; st.mPosition2 = p2; st.mTwistAxis1 = t1; st.mTwistAxis2 = t2; st.mPlaneAxis1 = n1; st.mPlaneAxis2 = n2;
                            st.mSwingType = jolt.ESwingType_Cone; st.mNormalHalfConeAngle = SWING; st.mPlaneHalfConeAngle = SWING; st.mTwistMinAngle = -TWIST; st.mTwistMaxAngle = TWIST;
                            part.set_mToParent(st);
                            jolt.destroy(p1); jolt.destroy(p2); jolt.destroy(t1); jolt.destroy(t2); jolt.destroy(n1); jolt.destroy(n2);
                        }
                        jolt.destroy(bp); jolt.destroy(bq);
                    }
                    settings.mParts = parts;
                    settings.DisableParentChildCollisions();
                    settings.Stabilize();
                    ragdoll = settings.CreateRagdoll(0, 0, ctx.physicsSystem) as typeof ragdoll;
                    ragdoll!.AddToPhysicsSystem(jolt.EActivation_Activate);
                    pose = new jolt.SkeletonPose(); pose.SetSkeleton(skel);
                    tv = new jolt.Vec3(0, 0, 0); tq = new jolt.Quat(0, 0, 0, 1); troot = new jolt.RVec3(0, 0, 0);
                    joints = jointIds;
                    let rootIdx = template.findIndex(t => (t.parentJointIndex ?? -1) < 0); if (rootIdx < 0) rootIdx = 0;
                    modelEntity = (db.store.get(jointIds[rootIdx], "parent") as Entity | undefined) ?? (0 as Entity);
                    jolt.destroy(settings);
                };

                return () => {
                    const ctx = db.store.resources._joltContext;
                    if (!ctx) return;
                    if (!built) {
                        for (const arch of db.store.queryArchetypes(["_skeletonJoints", "_skeletonGeometry"])) {
                            const jc = arch.columns._skeletonJoints, gc = arch.columns._skeletonGeometry;
                            for (let i = 0; i < arch.rowCount; i++) {
                                const g = db.store.read(gc.get(i)) as SkinGeo | null;
                                if (!g?._cpuSkin || !g._skinInverseBindMatrices || !g._skinJointTemplate?.length) continue;
                                build(ctx, jc.get(i), g); built = true; break;
                            }
                            if (built) break;
                        }
                        if (!built) return;
                    }
                    const jolt = ctx.jolt, rd = ragdoll!, p = pose!;
                    if (!dead && db.store.resources._ragdollTrigger) {
                        dead = true;
                        for (const a of db.store.queryArchetypes(["animationPlaying"])) for (let i = 0; i < a.rowCount; i++) db.store.update(a.columns.id.get(i), { animationPlaying: false });
                    }
                    if (!dead) {
                        // alive: drive the ragdoll toward the animated pose. Root offset =
                        // the model's world translation; joint states = the animated locals.
                        const rm = jointWorld(modelEntity);
                        troot!.Set(rm[12], rm[13], rm[14]); p.SetRootOffset(troot!);
                        for (let i = 0; i < joints.length; i++) {
                            const pos = db.store.get(joints[i], "position") as readonly number[] | undefined;
                            const rot = db.store.get(joints[i], "rotation") as readonly number[] | undefined;
                            if (!pos || !rot) continue;
                            const st = p.GetJoint(i);
                            tv!.Set(pos[0], pos[1], pos[2]); tq!.Set(rot[0], rot[1], rot[2], rot[3]);
                            st.set_mTranslation(tv!); st.set_mRotation(tq!);
                        }
                        p.CalculateJointMatrices();
                        rd.DriveToPoseUsingKinematics(p, db.store.resources.physicsClock.fixedDt * Math.max(1, db.store.resources.physicsClock.steps));
                    } else {
                        // limp: read the physics pose back. The ragdoll's root has fallen, so move
                        // the model to the pose's root offset and apply the local joint states —
                        // the whole skin follows the fall, the limbs flop.
                        rd.GetPose(p, false);
                        p.CalculateJointStates();
                        const ro = p.GetRootOffset();
                        db.store.update(modelEntity, { position: [ro.GetX(), ro.GetY(), ro.GetZ()] });
                        for (let i = 0; i < joints.length; i++) {
                            const st = p.GetJoint(i), t = st.get_mTranslation(), r = st.get_mRotation();
                            db.store.update(joints[i], { position: [t.GetX(), t.GetY(), t.GetZ()], rotation: [r.GetX(), r.GetY(), r.GetZ(), r.GetW()] });
                        }
                    }
                };
            },
        },
    },
});
