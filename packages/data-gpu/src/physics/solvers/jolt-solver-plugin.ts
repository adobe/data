// © 2026 Adobe. MIT License. See /LICENSE for details.

import initJolt from "jolt-physics";
import { Database, type Entity } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { physicsClock } from "../physics-clock-plugin.js";
import { physicsData } from "../physics-data-plugin.js";
import { BodyType } from "../body/body-type/body-type.js";
import { ColliderShape } from "../body/collider-shape/collider-shape.js";

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

// Two object layers (Jolt's collision-filtering requirement): statics don't
// collide with each other, dynamics collide with everything.
const L_STATIC = 0, L_DYNAMIC = 1, NUM_OBJECT_LAYERS = 2;
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

type JoltModule = Awaited<ReturnType<typeof initJolt>>;
type JBody = InstanceType<JoltModule["Body"]>;
type JBodyInterface = InstanceType<JoltModule["BodyInterface"]>;
type JJoltInterface = InstanceType<JoltModule["JoltInterface"]>;
type JRVec3 = InstanceType<JoltModule["RVec3"]>;
type JQuat = InstanceType<JoltModule["Quat"]>;
type JVec3 = InstanceType<JoltModule["Vec3"]>;
type JShape = InstanceType<JoltModule["Shape"]>;

interface MatProps { restitution: number; friction: number }

export const joltSolver = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, physicsClock),
    components: {
        _joltBody: True.schema, // tag: this body has been mirrored into the Jolt world
    },
    systems: {
        joltStep: {
            schedule: { during: ["physics"], after: ["advancePhysicsClock"] },
            create: db => {
                let J: JoltModule | null = null;
                let initStarted = false;
                let joltInterface: JJoltInterface | null = null;
                let bodyInterface: JBodyInterface | null = null;
                let kPos: JRVec3 | null = null, kRot: JQuat | null = null; // reused kinematic-drive temporaries
                const bodies = new Map<Entity, JBody>(); // entity → Jolt body

                const matPropsOf = (id: Entity): MatProps => {
                    const m = db.store.read(id) as { restitution?: number; friction?: number } | null;
                    return { restitution: m?.restitution ?? 0.2, friction: m?.friction ?? 0.5 };
                };

                const setup = (jolt: JoltModule): void => {
                    const objectFilter = new jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
                    objectFilter.EnableCollision(L_STATIC, L_DYNAMIC);
                    objectFilter.EnableCollision(L_DYNAMIC, L_DYNAMIC);
                    const bp = new jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BP_LAYERS);
                    bp.MapObjectToBroadPhaseLayer(L_STATIC, new jolt.BroadPhaseLayer(BP_STATIC));
                    bp.MapObjectToBroadPhaseLayer(L_DYNAMIC, new jolt.BroadPhaseLayer(BP_DYNAMIC));
                    const settings = new jolt.JoltSettings();
                    settings.mObjectLayerPairFilter = objectFilter;
                    settings.mBroadPhaseLayerInterface = bp;
                    settings.mObjectVsBroadPhaseLayerFilter = new jolt.ObjectVsBroadPhaseLayerFilterTable(bp, NUM_BP_LAYERS, objectFilter, NUM_OBJECT_LAYERS);
                    joltInterface = new jolt.JoltInterface(settings);
                    jolt.destroy(settings);
                    const physicsSystem = joltInterface.GetPhysicsSystem();
                    const g = new jolt.Vec3(0, -GRAVITY, 0);
                    physicsSystem.SetGravity(g);
                    jolt.destroy(g);
                    bodyInterface = physicsSystem.GetBodyInterface();
                    kPos = new jolt.RVec3(0, 0, 0); kRot = new jolt.Quat(0, 0, 0, 1);
                };

                const ensureBody = (jolt: JoltModule, bi: JBodyInterface, id: Entity, motion: BodyType, shape: ColliderShape, hx: number, hy: number, hz: number, mat: Entity, px: number, py: number, pz: number, q: ArrayLike<number>): void => {
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
                    } else { half = new jolt.Vec3(hx, hy, hz); shp = new jolt.BoxShape(half); }
                    const pos = new jolt.RVec3(px, py, pz), rot = new jolt.Quat(q[0], q[1], q[2], q[3]);
                    // dynamic = simulated; kinematic = position-driven (pushes dynamics, in the
                    // dynamic layer so it collides with them); static = immovable collider.
                    const motionType = motion === "dynamic" ? jolt.EMotionType_Dynamic
                        : motion === "kinematic" ? jolt.EMotionType_Kinematic : jolt.EMotionType_Static;
                    const settings = new jolt.BodyCreationSettings(shp, pos, rot, motionType, motion === "static" ? L_STATIC : L_DYNAMIC);
                    settings.mRestitution = m.restitution;
                    settings.mFriction = m.friction;
                    const body = bi.CreateBody(settings);
                    bi.AddBody(body.GetID(), motion === "static" ? jolt.EActivation_DontActivate : jolt.EActivation_Activate);
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
                        const he = arch.columns.halfExtents, pos = arch.columns.position, ori = arch.columns.rotation;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const id = ids.get(r), bodyType = bt.get(r), h = he.get(r), p = pos.get(r), o = ori.get(r);
                            ensureBody(jolt, bi, id, bodyType, cs.get(r), h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], o);
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
                            const id = ids.get(r), h = he.get(r), p = pos.get(r);
                            ensureBody(jolt, bi, id, "static", cs.get(r), h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], ori.get(r));
                            db.store.update(id, { _joltBody: true });
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
                    for (const arch of db.store.queryArchetypes(KINEMATIC, KINEMATIC_ONLY)) {
                        const ids = arch.columns.id;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const body = bodies.get(ids.get(r));
                            if (!body || !kPos || !kRot) continue;
                            const r3 = r * 3, r4 = r * 4;
                            kPos.Set(pos[r3], pos[r3 + 1], pos[r3 + 2]);
                            kRot.Set(ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]);
                            bi.MoveKinematic(body.GetID(), kPos, kRot, dt);
                        }
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
