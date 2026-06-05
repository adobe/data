// © 2026 Adobe. MIT License. See /LICENSE for details.

import initJolt from "jolt-physics";
import { Database, type Entity } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { physicsClock } from "../physics-clock-plugin.js";
import { physicsData } from "../physics-data-plugin.js";
import { jointData } from "../joint/joint-plugin.js";
import { BodyType } from "../body/body-type/body-type.js";
import { ColliderShape } from "../body/collider-shape/collider-shape.js";
import type { ColliderMesh } from "../body/collider-mesh.js";

/**
 * A third rigid-body solver behind the same `physicsData` seam — Jolt Physics
 * (Jorrit Rouwe, C++→WASM, the engine from *Horizon Forbidden West*). Like the
 * Rapier plugin it reads the identical authored components (`RigidBody` +
 * `StaticCollider`) and writes back `position`/`rotation`/velocity for dynamic
 * bodies, so the same scene runs unchanged on rapierSolver / joltSolver.
 *
 * Jolt's WASM initialises asynchronously; per the repo's no-top-level-await rule
 * the init promise lives in the system closure and the system no-ops until the
 * world exists, then runs every frame. All interop with the Emscripten binding
 * is contained in this one module.
 */

const GRAVITY = 18; // matches rapierSolver so the two solvers are directly comparable

// Object layers (Jolt's collision-filtering requirement): statics don't collide
// with each other; dynamics collide with everything; the RAGDOLL layer collides
// with the world (static + dynamic) but NOT itself — so a collisionGroup>0 body
// (a ragdoll's bones) never self-collides.
const L_STATIC = 0, L_DYNAMIC = 1, L_RAGDOLL = 2, NUM_OBJECT_LAYERS = 3;
const BP_STATIC = 0, BP_DYNAMIC = 1, NUM_BP_LAYERS = 2;

const RIGID = ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"] as const;
const STATIC = ["colliderShape", "halfExtents", "material", "position", "rotation"] as const;
// Dynamic bodies carry the derived prev-pose snapshot (added on first sync) used
// for render interpolation; this query reads/writes it alongside the live pose.
const SNAPSHOT = ["bodyType", "position", "rotation", "_prevPosition", "_prevRotation"] as const;
// Sync only over bodies not yet mirrored into Jolt (excluded by the `_joltBody`
// tag added on creation) → steady state iterates zero rows instead of
// re-scanning every body each frame.
const NEW_RIGID = { exclude: ["_joltBody"] } as const;
const NEW_STATIC = { exclude: ["linearVelocity", "_joltBody"] } as const;
// Kinematic bodies, by archetype shape (no per-row value test): they have
// `bodyType` (so not a StaticCollider) and are mirrored (`_joltBody`) but never
// gained `_prevPosition` (only dynamics do) — so excluding it isolates kinematics.
const KINEMATIC = ["bodyType", "position", "rotation", "_joltBody"] as const;
const KINEMATIC_ONLY = { exclude: ["_prevPosition"] } as const;
const JOINT = ["jointType", "jointBodyA", "jointBodyB", "jointAnchorA", "jointAnchorB", "jointAxis", "jointMinLimit", "jointMaxLimit", "jointSwingLimit"] as const;
const NEW_JOINT = { exclude: ["_joltJoint"] } as const;

type JoltModule = Awaited<ReturnType<typeof initJolt>>;
type JBody = InstanceType<JoltModule["Body"]>;
type JBodyInterface = InstanceType<JoltModule["BodyInterface"]>;
type JJoltInterface = InstanceType<JoltModule["JoltInterface"]>;
type JRVec3 = InstanceType<JoltModule["RVec3"]>;
type JQuat = InstanceType<JoltModule["Quat"]>;
type JVec3 = InstanceType<JoltModule["Vec3"]>;
type JShape = InstanceType<JoltModule["Shape"]>;
type JPhysicsSystem = InstanceType<JoltModule["PhysicsSystem"]>;

interface MatProps { restitution: number; friction: number }

export const joltSolver = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, jointData, physicsClock),
    components: {
        _joltBody: True.schema, // tag: this body has been mirrored into the Jolt world
        _joltJoint: True.schema, // tag: this joint has been mirrored into the Jolt world
    },
    systems: {
        joltStep: {
            schedule: { during: ["physics"], after: ["advancePhysicsClock"] },
            create: db => {
                let J: JoltModule | null = null;
                let initStarted = false;
                let joltInterface: JJoltInterface | null = null;
                let bodyInterface: JBodyInterface | null = null;
                let physicsSystem: JPhysicsSystem | null = null;
                let kPos: JRVec3 | null = null, kRot: JQuat | null = null; // reused kinematic-drive temporaries
                const bodies = new Map<Entity, JBody>(); // entity → Jolt body

                const matPropsOf = (id: Entity): MatProps => {
                    const m = db.store.read(id) as { restitution?: number; friction?: number } | null;
                    return { restitution: m?.restitution ?? 0.2, friction: m?.friction ?? 0.5 };
                };

                // hull/mesh colliders may be auto-generated from a model that's still
                // loading — defer mirroring such a body until its collision data exists.
                const colliderReady = (id: Entity, shape: ColliderShape): boolean => {
                    if (shape !== "hull" && shape !== "mesh") return true;
                    const r = db.store.read(id) as { convexPoints?: unknown; colliderMesh?: unknown } | null;
                    return !!(r?.convexPoints || r?.colliderMesh);
                };

                // Jolt joints anchor in world space; map each body-local anchor (and the
                // hinge axis) to world using the body's spawn pose. Reused scratch triples.
                const rotateInto = (q: ArrayLike<number>, vx: number, vy: number, vz: number, out: [number, number, number]): void => {
                    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
                    const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
                    out[0] = vx + qw * tx + (qy * tz - qz * ty);
                    out[1] = vy + qw * ty + (qz * tx - qx * tz);
                    out[2] = vz + qw * tz + (qx * ty - qy * tx);
                };
                const perpInto = (v: ArrayLike<number>, out: [number, number, number]): void => {
                    if (Math.abs(v[0]) <= Math.abs(v[1]) && Math.abs(v[0]) <= Math.abs(v[2])) { out[0] = 0; out[1] = v[2]; out[2] = -v[1]; }
                    else { out[0] = -v[2]; out[1] = 0; out[2] = v[0]; }
                    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
                };
                const wa: [number, number, number] = [0, 0, 0], wb: [number, number, number] = [0, 0, 0];
                const wAxis: [number, number, number] = [0, 0, 0], wNorm: [number, number, number] = [0, 0, 0];

                const setup = (jolt: JoltModule): void => {
                    const objectFilter = new jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
                    objectFilter.EnableCollision(L_STATIC, L_DYNAMIC);
                    objectFilter.EnableCollision(L_DYNAMIC, L_DYNAMIC);
                    objectFilter.EnableCollision(L_STATIC, L_RAGDOLL);
                    objectFilter.EnableCollision(L_DYNAMIC, L_RAGDOLL); // ragdoll collides with the world, not itself
                    const bp = new jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BP_LAYERS);
                    bp.MapObjectToBroadPhaseLayer(L_STATIC, new jolt.BroadPhaseLayer(BP_STATIC));
                    bp.MapObjectToBroadPhaseLayer(L_DYNAMIC, new jolt.BroadPhaseLayer(BP_DYNAMIC));
                    bp.MapObjectToBroadPhaseLayer(L_RAGDOLL, new jolt.BroadPhaseLayer(BP_DYNAMIC));
                    const settings = new jolt.JoltSettings();
                    settings.mObjectLayerPairFilter = objectFilter;
                    settings.mBroadPhaseLayerInterface = bp;
                    settings.mObjectVsBroadPhaseLayerFilter = new jolt.ObjectVsBroadPhaseLayerFilterTable(bp, NUM_BP_LAYERS, objectFilter, NUM_OBJECT_LAYERS);
                    joltInterface = new jolt.JoltInterface(settings);
                    jolt.destroy(settings);
                    physicsSystem = joltInterface.GetPhysicsSystem();
                    const g = new jolt.Vec3(0, -GRAVITY, 0);
                    physicsSystem.SetGravity(g);
                    jolt.destroy(g);
                    bodyInterface = physicsSystem.GetBodyInterface();
                    kPos = new jolt.RVec3(0, 0, 0); kRot = new jolt.Quat(0, 0, 0, 1);
                };

                const ensureBody = (jolt: JoltModule, bi: JBodyInterface, id: Entity, motion: BodyType, shape: ColliderShape, hx: number, hy: number, hz: number, mat: Entity, px: number, py: number, pz: number, q: ArrayLike<number>, vx: number, vy: number, vz: number, wx: number, wy: number, wz: number): void => {
                    if (bodies.has(id)) return;
                    const m = matPropsOf(mat);
                    // box needs a Vec3 half-extent temporary; sphere/capsule are scalar;
                    // hull is built from the authored point cloud (read once here).
                    // capsule: Y-aligned, halfHeight = cylinder half (hy), radius = hx.
                    let half: JVec3 | null = null;
                    let shp: JShape;
                    if (shape === "sphere") shp = new jolt.SphereShape(hx);
                    else if (shape === "capsule") shp = new jolt.CapsuleShape(hy, hx);
                    else if (shape === "hull") {
                        const pts = (db.store.read(id) as { convexPoints?: Float32Array | null }).convexPoints;
                        const hs = new jolt.ConvexHullShapeSettings();
                        if (pts) for (let i = 0; i < pts.length; i += 3) {
                            const v = new jolt.Vec3(pts[i], pts[i + 1], pts[i + 2]);
                            hs.mPoints.push_back(v); jolt.destroy(v); // push_back copies the value
                        }
                        const res = hs.Create();
                        shp = res.IsValid() ? res.Get() : new jolt.SphereShape(Math.max(hx, 0.1)); // degenerate fallback
                        jolt.destroy(hs);
                    } else if (shape === "mesh") {
                        const cm = (db.store.read(id) as { colliderMesh?: ColliderMesh | null }).colliderMesh;
                        const verts = new jolt.VertexList(), tris = new jolt.IndexedTriangleList(), mats = new jolt.PhysicsMaterialList();
                        if (cm) {
                            for (let i = 0; i < cm.positions.length; i += 3) {
                                const f = new jolt.Float3(cm.positions[i], cm.positions[i + 1], cm.positions[i + 2]);
                                verts.push_back(f); jolt.destroy(f); // copied by value
                            }
                            for (let i = 0; i < cm.indices.length; i += 3) {
                                const t = new jolt.IndexedTriangle(cm.indices[i], cm.indices[i + 1], cm.indices[i + 2], 0);
                                tris.push_back(t); jolt.destroy(t);
                            }
                        }
                        const ms = new jolt.MeshShapeSettings(verts, tris, mats);
                        const res = ms.Create();
                        shp = res.IsValid() ? res.Get() : new jolt.SphereShape(0.1);
                        jolt.destroy(ms); jolt.destroy(verts); jolt.destroy(tris); jolt.destroy(mats);
                    } else { half = new jolt.Vec3(hx, hy, hz); shp = new jolt.BoxShape(half); }
                    const pos = new jolt.RVec3(px, py, pz), rot = new jolt.Quat(q[0], q[1], q[2], q[3]);
                    // dynamic = simulated; kinematic = position-driven (pushes dynamics, in the
                    // dynamic layer so it collides with them); static = immovable collider.
                    const motionType = motion === "dynamic" ? jolt.EMotionType_Dynamic
                        : motion === "kinematic" ? jolt.EMotionType_Kinematic : jolt.EMotionType_Static;
                    // collisionGroup>0 ⇒ the no-self-collide RAGDOLL layer.
                    const grp = (db.store.read(id) as { collisionGroup?: number } | null)?.collisionGroup ?? 0;
                    const layer = motion === "static" ? L_STATIC : grp > 0 ? L_RAGDOLL : L_DYNAMIC;
                    const settings = new jolt.BodyCreationSettings(shp, pos, rot, motionType, layer);
                    settings.mRestitution = m.restitution;
                    settings.mFriction = m.friction;
                    const body = bi.CreateBody(settings);
                    bi.AddBody(body.GetID(), motion === "static" ? jolt.EActivation_DontActivate : jolt.EActivation_Activate);
                    if (motion === "dynamic" && (vx || vy || vz || wx || wy || wz)) {
                        const lv = new jolt.Vec3(vx, vy, vz), av = new jolt.Vec3(wx, wy, wz);
                        bi.SetLinearAndAngularVelocity(body.GetID(), lv, av);
                        jolt.destroy(lv); jolt.destroy(av);
                    }
                    bodies.set(id, body);
                    // free the construction temporaries (the body keeps a ref to the shape)
                    jolt.destroy(settings); jolt.destroy(pos); jolt.destroy(rot);
                    if (half) jolt.destroy(half);
                };

                return () => {
                    if (!J || !bodyInterface || !joltInterface) {
                        if (!initStarted) { initStarted = true; initJolt().then((j: JoltModule) => { J = j; setup(j); }); }
                        return; // WASM not ready yet
                    }
                    const jolt = J, bi = bodyInterface;

                    // sync: mirror only bodies not yet in Jolt (excluded by tag),
                    // then tag them. Tail→head since every row migrates out on
                    // tagging; reads via column accessors (robust to migration, and
                    // this loop only touches genuinely-new bodies, so it's cold).
                    for (const arch of db.store.queryArchetypes(RIGID, NEW_RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents, pos = arch.columns.position, ori = arch.columns.rotation, lv = arch.columns.linearVelocity, av = arch.columns.angularVelocity;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const id = ids.get(r), bodyType = bt.get(r), shape = cs.get(r), h = he.get(r), p = pos.get(r), o = ori.get(r), v = lv.get(r), w = av.get(r);
                            if (!colliderReady(id, shape)) continue; // auto-collider not generated yet
                            ensureBody(jolt, bi, id, bodyType, shape, h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], o, v[0], v[1], v[2], w[0], w[1], w[2]);
                            // Tag as mirrored. Dynamics also migrate onto the derived prev-pose
                            // snapshot (the interpolator reads it); kinematic bodies are authored
                            // each frame, so they render at the live pose with no snapshot — the
                            // _prevPosition absence is exactly what the kinematic-drive query keys on.
                            db.store.update(id, BodyType.isDynamic(bodyType) ? { _joltBody: true, _prevPosition: p, _prevRotation: o } : { _joltBody: true });
                        }
                    }
                    for (const arch of db.store.queryArchetypes(STATIC, NEW_STATIC)) {
                        const ids = arch.columns.id, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents, pos = arch.columns.position, ori = arch.columns.rotation;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const id = ids.get(r), shape = cs.get(r), h = he.get(r), p = pos.get(r);
                            if (!colliderReady(id, shape)) continue; // auto-collider not generated yet
                            ensureBody(jolt, bi, id, "static", shape, h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], ori.get(r), 0, 0, 0, 0, 0, 0);
                            db.store.update(id, { _joltBody: true });
                        }
                    }

                    // Mirror new joints once both bodies exist (tag + exclude; tail→head).
                    // Anchors/axes are body-local; map to world (Jolt WorldSpace) via spawn pose.
                    for (const arch of db.store.queryArchetypes(JOINT, NEW_JOINT)) {
                        const ids = arch.columns.id, jt = arch.columns.jointType, ba = arch.columns.jointBodyA, bbc = arch.columns.jointBodyB;
                        const aa = arch.columns.jointAnchorA, ab = arch.columns.jointAnchorB, axc = arch.columns.jointAxis, lo = arch.columns.jointMinLimit, hi = arch.columns.jointMaxLimit, sw = arch.columns.jointSwingLimit;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const a = bodies.get(ba.get(r)), b = bodies.get(bbc.get(r));
                            if (!a || !b || !physicsSystem) continue; // a body isn't mirrored yet — retry next frame
                            const recA = db.store.read(ba.get(r)) as { position: ArrayLike<number>; rotation: ArrayLike<number> };
                            const recB = db.store.read(bbc.get(r)) as { position: ArrayLike<number>; rotation: ArrayLike<number> };
                            const an = aa.get(r), bn = ab.get(r);
                            rotateInto(recA.rotation, an[0], an[1], an[2], wa); wa[0] += recA.position[0]; wa[1] += recA.position[1]; wa[2] += recA.position[2];
                            rotateInto(recB.rotation, bn[0], bn[1], bn[2], wb); wb[0] += recB.position[0]; wb[1] += recB.position[1]; wb[2] += recB.position[2];
                            const p1 = new jolt.RVec3(wa[0], wa[1], wa[2]), p2 = new jolt.RVec3(wb[0], wb[1], wb[2]);
                            const temps: { __brand?: never }[] = [p1, p2];
                            const type = jt.get(r);
                            let settings: InstanceType<JoltModule["TwoBodyConstraintSettings"]>;
                            if (type === "hinge") {
                                const ax = axc.get(r);
                                rotateInto(recA.rotation, ax[0], ax[1], ax[2], wAxis); perpInto(wAxis, wNorm);
                                const h1 = new jolt.Vec3(wAxis[0], wAxis[1], wAxis[2]), h2 = new jolt.Vec3(wAxis[0], wAxis[1], wAxis[2]);
                                const n1 = new jolt.Vec3(wNorm[0], wNorm[1], wNorm[2]), n2 = new jolt.Vec3(wNorm[0], wNorm[1], wNorm[2]);
                                const hs = new jolt.HingeConstraintSettings();
                                hs.mSpace = jolt.EConstraintSpace_WorldSpace; hs.mPoint1 = p1; hs.mPoint2 = p2;
                                hs.mHingeAxis1 = h1; hs.mHingeAxis2 = h2; hs.mNormalAxis1 = n1; hs.mNormalAxis2 = n2;
                                const min = lo.get(r), max = hi.get(r); if (min < max) { hs.mLimitsMin = min; hs.mLimitsMax = max; }
                                settings = hs; temps.push(h1, h2, n1, n2, hs);
                            } else if (type === "cone") {
                                // swing-twist: bone axis bound to a (symmetric) cone around the
                                // reference axis, plus a twist range about it — anatomical limits.
                                const ax = axc.get(r);
                                rotateInto(recA.rotation, ax[0], ax[1], ax[2], wAxis); perpInto(wAxis, wNorm);
                                const t1 = new jolt.Vec3(wAxis[0], wAxis[1], wAxis[2]), t2 = new jolt.Vec3(wAxis[0], wAxis[1], wAxis[2]);
                                const pa1 = new jolt.Vec3(wNorm[0], wNorm[1], wNorm[2]), pa2 = new jolt.Vec3(wNorm[0], wNorm[1], wNorm[2]);
                                const cs = new jolt.SwingTwistConstraintSettings();
                                cs.mSpace = jolt.EConstraintSpace_WorldSpace; cs.mPosition1 = p1; cs.mPosition2 = p2;
                                cs.mTwistAxis1 = t1; cs.mTwistAxis2 = t2; cs.mPlaneAxis1 = pa1; cs.mPlaneAxis2 = pa2;
                                cs.mSwingType = jolt.ESwingType_Cone;
                                const swing = sw.get(r); cs.mNormalHalfConeAngle = swing; cs.mPlaneHalfConeAngle = swing;
                                const min = lo.get(r), max = hi.get(r);
                                cs.mTwistMinAngle = min < max ? min : -Math.PI; cs.mTwistMaxAngle = min < max ? max : Math.PI;
                                settings = cs; temps.push(t1, t2, pa1, pa2, cs);
                            } else if (type === "fixed") {
                                const fs = new jolt.FixedConstraintSettings(); fs.mSpace = jolt.EConstraintSpace_WorldSpace; fs.mPoint1 = p1; fs.mPoint2 = p2;
                                settings = fs; temps.push(fs);
                            } else {
                                const ps = new jolt.PointConstraintSettings(); ps.mSpace = jolt.EConstraintSpace_WorldSpace; ps.mPoint1 = p1; ps.mPoint2 = p2;
                                settings = ps; temps.push(ps);
                            }
                            physicsSystem.AddConstraint(settings.Create(a, b));
                            for (const t of temps) jolt.destroy(t);
                            db.store.update(ids.get(r), { _joltJoint: true });
                        }
                    }

                    // Step on the fixed clock: 0..N steps of `fixedDt` this frame
                    // (decoupled from the render rate). On a stepping frame, snapshot
                    // the pose entering the final step into `_prevPosition`/`_prevRotation`
                    // first, so the pre-render interpolator can blend prev→current.
                    const clock = db.store.resources.physicsClock;
                    const steps = clock.steps;
                    if (steps === 0) return; // no sim time accrued — leave pose + snapshot intact

                    // Drive kinematic bodies to their authored pose: MoveKinematic derives
                    // the velocity to reach the target over the step, so the body pushes
                    // dynamics. (Author the pose however you like; the solver just follows.)
                    const dt = clock.fixedDt * steps;
                    const toFlip: Entity[] = []; // kinematic bodies whose bodyType became "dynamic" (ragdoll)
                    for (const arch of db.store.queryArchetypes(KINEMATIC, KINEMATIC_ONLY)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const body = bodies.get(ids.get(r));
                            if (!body || !kPos || !kRot) continue;
                            if (bt.get(r) === "dynamic") { toFlip.push(ids.get(r)); continue; }
                            const r3 = r * 3, r4 = r * 4;
                            kPos.Set(pos[r3], pos[r3 + 1], pos[r3 + 2]);
                            kRot.Set(ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]);
                            bi.MoveKinematic(body.GetID(), kPos, kRot, dt);
                        }
                    }
                    // Flip kinematic→dynamic (after the loop — migrating the row moves the typed
                    // arrays): become dynamic + gain the prev-pose snapshot, so it's simulated.
                    for (const id of toFlip) {
                        const body = bodies.get(id);
                        if (!body) continue;
                        bi.SetMotionType(body.GetID(), jolt.EMotionType_Dynamic, jolt.EActivation_Activate);
                        const rec = db.store.read(id) as { position: ArrayLike<number>; rotation: ArrayLike<number> };
                        db.store.update(id, {
                            _prevPosition: [rec.position[0], rec.position[1], rec.position[2]],
                            _prevRotation: [rec.rotation[0], rec.rotation[1], rec.rotation[2], rec.rotation[3]],
                        });
                    }
                    for (const arch of db.store.queryArchetypes(SNAPSHOT)) {
                        const bt = arch.columns.bodyType;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        const pp = arch.columns._prevPosition.getTypedArray(), pr = arch.columns._prevRotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            if (!BodyType.isDynamic(bt.get(r))) continue;
                            const r3 = r * 3, r4 = r * 4;
                            pp[r3] = pos[r3]; pp[r3 + 1] = pos[r3 + 1]; pp[r3 + 2] = pos[r3 + 2];
                            pr[r4] = ori[r4]; pr[r4 + 1] = ori[r4 + 1]; pr[r4 + 2] = ori[r4 + 2]; pr[r4 + 3] = ori[r4 + 3];
                        }
                    }
                    for (let s = 0; s < steps; s++) joltInterface.Step(clock.fixedDt, 1);

                    // write the dynamic bodies' new pose + velocity back onto the canonical columns
                    for (const arch of db.store.queryArchetypes(RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        const lv = arch.columns.linearVelocity.getTypedArray(), av = arch.columns.angularVelocity.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            if (!BodyType.isDynamic(bt.get(r))) continue;
                            const body = bodies.get(ids.get(r));
                            if (!body) continue;
                            const t = body.GetPosition(), rot = body.GetRotation(), v = body.GetLinearVelocity(), w = body.GetAngularVelocity();
                            const r3 = r * 3, r4 = r * 4;
                            pos[r3] = t.GetX(); pos[r3 + 1] = t.GetY(); pos[r3 + 2] = t.GetZ();
                            ori[r4] = rot.GetX(); ori[r4 + 1] = rot.GetY(); ori[r4 + 2] = rot.GetZ(); ori[r4 + 3] = rot.GetW();
                            lv[r3] = v.GetX(); lv[r3 + 1] = v.GetY(); lv[r3 + 2] = v.GetZ();
                            av[r3] = w.GetX(); av[r3 + 1] = w.GetY(); av[r3 + 2] = w.GetZ();
                        }
                    }
                };
            },
        },
    },
});
