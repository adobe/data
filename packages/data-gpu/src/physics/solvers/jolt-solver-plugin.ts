// © 2026 Adobe. MIT License. See /LICENSE for details.

import initJolt from "jolt-physics";
import { Database, type Entity } from "@adobe/data/ecs";
import { core } from "../../core/core-plugin.js";
import { physicsData } from "../physics-data-plugin.js";
import { BodyType } from "../body/body-type/body-type.js";
import { ColliderShape } from "../body/collider-shape/collider-shape.js";

/**
 * A third rigid-body solver behind the same `physicsData` seam — Jolt Physics
 * (Jorrit Rouwe, C++→WASM, the engine from *Horizon Forbidden West*). Like the
 * Rapier plugin it reads the identical authored components (`RigidBody` +
 * `StaticCollider`) and writes back `position`/`rotation`/velocity for dynamic
 * bodies, so the same scene runs unchanged on cpuXpbd / rapierSolver / joltSolver.
 *
 * Jolt's WASM initialises asynchronously; per the repo's no-top-level-await rule
 * the init promise lives in the system closure and the system no-ops until the
 * world exists, then runs every frame. All interop with the Emscripten binding
 * is contained in this one module.
 */

const GRAVITY = 18; // matches the cpuXpbd / rapier samples so all three are comparable

// Two object layers (Jolt's collision-filtering requirement): statics don't
// collide with each other, dynamics collide with everything.
const L_STATIC = 0, L_DYNAMIC = 1, NUM_OBJECT_LAYERS = 2;
const BP_STATIC = 0, BP_DYNAMIC = 1, NUM_BP_LAYERS = 2;

const RIGID = ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"] as const;
const STATIC = ["colliderShape", "halfExtents", "material", "position", "rotation"] as const;
const STATIC_EXCLUDE = { exclude: ["linearVelocity"] } as const;

type JoltModule = Awaited<ReturnType<typeof initJolt>>;
type JBody = InstanceType<JoltModule["Body"]>;
type JBodyInterface = InstanceType<JoltModule["BodyInterface"]>;
type JJoltInterface = InstanceType<JoltModule["JoltInterface"]>;

interface MatProps { restitution: number; friction: number }

export const joltSolver = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, core),
    systems: {
        joltStep: {
            schedule: { during: ["physics"] },
            create: db => {
                let J: JoltModule | null = null;
                let initStarted = false;
                let joltInterface: JJoltInterface | null = null;
                let bodyInterface: JBodyInterface | null = null;
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
                };

                const ensureBody = (jolt: JoltModule, bi: JBodyInterface, id: Entity, dynamic: boolean, shape: ColliderShape, hx: number, hy: number, hz: number, mat: Entity, px: number, py: number, pz: number, q: ArrayLike<number>): void => {
                    if (bodies.has(id)) return;
                    const m = matPropsOf(mat);
                    const half = shape === "sphere" ? null : new jolt.Vec3(hx, hy, hz);
                    const shp = shape === "sphere" ? new jolt.SphereShape(hx) : new jolt.BoxShape(half!);
                    const pos = new jolt.RVec3(px, py, pz), rot = new jolt.Quat(q[0], q[1], q[2], q[3]);
                    const settings = new jolt.BodyCreationSettings(shp, pos, rot, dynamic ? jolt.EMotionType_Dynamic : jolt.EMotionType_Static, dynamic ? L_DYNAMIC : L_STATIC);
                    settings.mRestitution = m.restitution;
                    settings.mFriction = m.friction;
                    const body = bi.CreateBody(settings);
                    bi.AddBody(body.GetID(), dynamic ? jolt.EActivation_Activate : jolt.EActivation_DontActivate);
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

                    // sync: create a Jolt body for every authored body not yet mirrored
                    for (const arch of db.store.queryArchetypes(RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents.getTypedArray(), pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const id = ids.get(r);
                            if (bodies.has(id)) continue;
                            const r3 = r * 3, r4 = r * 4;
                            ensureBody(jolt, bi, id, BodyType.isDynamic(bt.get(r)), cs.get(r), he[r3], he[r3 + 1], he[r3 + 2], mat.get(r), pos[r3], pos[r3 + 1], pos[r3 + 2], [ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]]);
                        }
                    }
                    for (const arch of db.store.queryArchetypes(STATIC, STATIC_EXCLUDE)) {
                        const ids = arch.columns.id, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents.getTypedArray(), pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const id = ids.get(r);
                            if (bodies.has(id)) continue;
                            const r3 = r * 3, r4 = r * 4;
                            ensureBody(jolt, bi, id, false, cs.get(r), he[r3], he[r3 + 1], he[r3 + 2], mat.get(r), pos[r3], pos[r3 + 1], pos[r3 + 2], [ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]]);
                        }
                    }

                    const dt = db.store.resources.frameTime.dt;
                    joltInterface.Step(dt < 0.033 ? dt : 0.033, 1);

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
