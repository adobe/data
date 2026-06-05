// © 2026 Adobe. MIT License. See /LICENSE for details.

import RAPIER from "@dimforge/rapier3d-compat";
import { Database, type Entity } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { physicsClock } from "../physics-clock-plugin.js";
import { physicsData } from "../physics-data-plugin.js";
import { jointData } from "../joint/joint-plugin.js";
import { BodyType } from "../body/body-type/body-type.js";
import { ColliderShape } from "../body/collider-shape/collider-shape.js";

/**
 * A second rigid-body solver behind the same `physicsData` seam — the
 * battle-tested Rapier engine (dimforge, Rust→WASM). It reads the identical
 * authored components (`RigidBody` + `StaticCollider`) and writes back
 * `position`/`rotation`/velocity for dynamic bodies, exactly like `joltSolver`,
 * so the same scene runs unchanged on either solver.
 *
 * Rapier's WASM must be initialised before use; per the repo's no-top-level-await
 * rule, the init promise lives in the system closure and is awaited lazily — the
 * system no-ops until the world exists, then runs every frame.
 */

const GRAVITY = 18; // matches joltSolver so the two solvers are directly comparable

const RIGID = ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"] as const;
const STATIC = ["colliderShape", "halfExtents", "material", "position", "rotation"] as const;
// Dynamic bodies carry the derived prev-pose snapshot (added on first sync) used
// for render interpolation; this query reads/writes it alongside the live pose.
const SNAPSHOT = ["bodyType", "position", "rotation", "_prevPosition", "_prevRotation"] as const;
// Sync only over bodies not yet mirrored into Rapier: a private `_rapierBody`
// tag is added once a body is created, and excluded here, so steady state
// iterates zero rows (archetype-level) instead of re-scanning every body each
// frame — the win for the "many static, few dynamic" target.
const NEW_RIGID = { exclude: ["_rapierBody"] } as const;
const NEW_STATIC = { exclude: ["linearVelocity", "_rapierBody"] } as const;
// Kinematic bodies, by archetype shape (no per-row value test): they have
// `bodyType` (so not a StaticCollider) and are mirrored (`_rapierBody`) but never
// gained `_prevPosition` (only dynamics do) — so excluding it isolates kinematics.
const KINEMATIC = ["bodyType", "position", "rotation", "_rapierBody"] as const;
const KINEMATIC_ONLY = { exclude: ["_prevPosition"] } as const;
const JOINT = ["jointType", "jointBodyA", "jointBodyB", "jointAnchorA", "jointAnchorB", "jointAxis", "jointMinLimit", "jointMaxLimit"] as const;
const NEW_JOINT = { exclude: ["_rapierJoint"] } as const;

interface MatProps { density: number; restitution: number; friction: number }

export const rapierSolver = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, jointData, physicsClock),
    components: {
        _rapierBody: True.schema, // tag: this body has been mirrored into the Rapier world
        _rapierJoint: True.schema, // tag: this joint has been mirrored into the Rapier world
    },
    systems: {
        rapierStep: {
            schedule: { during: ["physics"], after: ["advancePhysicsClock"] },
            create: db => {
                let world: RAPIER.World | null = null;
                let initStarted = false;
                const bodies = new Map<Entity, RAPIER.RigidBody>(); // entity → Rapier body

                const matPropsOf = (id: Entity): MatProps => {
                    // Material entities carry density/restitution/friction (read once at body creation).
                    const m = db.store.read(id) as { density?: number; restitution?: number; friction?: number } | null;
                    return { density: m?.density ?? 1, restitution: m?.restitution ?? 0.2, friction: m?.friction ?? 0.5 };
                };

                // hull/mesh colliders may be auto-generated from a model that's still
                // loading — defer mirroring such a body until its collision data exists.
                const colliderReady = (id: Entity, shape: ColliderShape): boolean => {
                    if (shape !== "hull" && shape !== "mesh") return true;
                    const r = db.store.read(id) as { convexPoints?: unknown; colliderMesh?: unknown } | null;
                    return !!(r?.convexPoints || r?.colliderMesh);
                };

                const ensureBody = (id: Entity, motion: BodyType, shape: ColliderShape, hx: number, hy: number, hz: number, mat: Entity, px: number, py: number, pz: number, q: ArrayLike<number>, vx: number, vy: number, vz: number): void => {
                    if (!world || bodies.has(id)) return;
                    const m = matPropsOf(mat);
                    // dynamic = simulated; kinematic = position-driven (pushes dynamics,
                    // isn't pushed back); fixed = immovable collider.
                    const desc = motion === "dynamic" ? RAPIER.RigidBodyDesc.dynamic()
                        : motion === "kinematic" ? RAPIER.RigidBodyDesc.kinematicPositionBased()
                            : RAPIER.RigidBodyDesc.fixed();
                    desc.setTranslation(px, py, pz).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
                    if (motion === "dynamic") desc.setLinvel(vx, vy, vz);
                    const body = world.createRigidBody(desc);
                    // capsule: Y-aligned, halfHeight = cylinder half (hy), radius = hx.
                    // hull: convex hull of the authored point cloud (read once here).
                    let col: RAPIER.ColliderDesc | null;
                    if (shape === "sphere") col = RAPIER.ColliderDesc.ball(hx);
                    else if (shape === "capsule") col = RAPIER.ColliderDesc.capsule(hy, hx);
                    else if (shape === "hull") {
                        const pts = (db.store.read(id) as { convexPoints?: Float32Array | null }).convexPoints;
                        col = pts ? RAPIER.ColliderDesc.convexHull(pts) : null;
                        if (!col) col = RAPIER.ColliderDesc.ball(Math.max(hx, 0.1)); // degenerate cloud fallback
                    } else if (shape === "mesh") {
                        const cm = (db.store.read(id) as { colliderMesh?: { positions: Float32Array; indices: Uint32Array } | null }).colliderMesh;
                        col = cm ? RAPIER.ColliderDesc.trimesh(cm.positions, cm.indices) : RAPIER.ColliderDesc.cuboid(0.1, 0.1, 0.1);
                    } else col = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
                    col.setRestitution(m.restitution).setFriction(m.friction).setDensity(m.density);
                    world.createCollider(col, body);
                    bodies.set(id, body);
                };

                return () => {
                    if (!world) {
                        if (!initStarted) {
                            initStarted = true;
                            RAPIER.init().then(() => { world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 }); });
                        }
                        return; // WASM not ready yet
                    }

                    // sync: mirror only bodies not yet in Rapier (excluded by tag),
                    // then tag them. Iterate tail→head since every row migrates out
                    // on tagging. Reads use column accessors (robust to the migration;
                    // this loop only touches genuinely-new bodies, so it's cold).
                    for (const arch of db.store.queryArchetypes(RIGID, NEW_RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents, pos = arch.columns.position, ori = arch.columns.rotation, lv = arch.columns.linearVelocity;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const id = ids.get(r), bodyType = bt.get(r), shape = cs.get(r), h = he.get(r), p = pos.get(r), o = ori.get(r), v = lv.get(r);
                            if (!colliderReady(id, shape)) continue; // auto-collider not generated yet
                            ensureBody(id, bodyType, shape, h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], o, v[0], v[1], v[2]);
                            // Tag as mirrored. Dynamics also migrate onto the derived prev-pose
                            // snapshot (the interpolator reads it); kinematic bodies are authored
                            // each frame, so they render at the live pose with no snapshot — the
                            // _prevPosition absence is exactly what the kinematic-drive query keys on.
                            db.store.update(id, BodyType.isDynamic(bodyType) ? { _rapierBody: true, _prevPosition: p, _prevRotation: o } : { _rapierBody: true });
                        }
                    }
                    for (const arch of db.store.queryArchetypes(STATIC, NEW_STATIC)) {
                        const ids = arch.columns.id, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents, pos = arch.columns.position, ori = arch.columns.rotation;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const id = ids.get(r), shape = cs.get(r), h = he.get(r), p = pos.get(r);
                            if (!colliderReady(id, shape)) continue; // auto-collider not generated yet
                            ensureBody(id, "static", shape, h[0], h[1], h[2], mat.get(r), p[0], p[1], p[2], ori.get(r), 0, 0, 0);
                            db.store.update(id, { _rapierBody: true });
                        }
                    }

                    // Mirror new joints once both their bodies exist (tag + exclude;
                    // tail→head since tagging migrates the row). Anchors are body-local.
                    for (const arch of db.store.queryArchetypes(JOINT, NEW_JOINT)) {
                        const ids = arch.columns.id, jt = arch.columns.jointType;
                        const ba = arch.columns.jointBodyA, bb = arch.columns.jointBodyB;
                        const aa = arch.columns.jointAnchorA, ab = arch.columns.jointAnchorB, axc = arch.columns.jointAxis;
                        const lo = arch.columns.jointMinLimit, hi = arch.columns.jointMaxLimit;
                        for (let r = arch.rowCount - 1; r >= 0; r--) {
                            const a = bodies.get(ba.get(r)), b = bodies.get(bb.get(r));
                            if (!a || !b) continue; // a body isn't mirrored yet — retry next frame
                            const type = jt.get(r), pa = aa.get(r), pb = ab.get(r), ax = axc.get(r), min = lo.get(r), max = hi.get(r);
                            const A = { x: pa[0], y: pa[1], z: pa[2] }, B = { x: pb[0], y: pb[1], z: pb[2] };
                            let jd: RAPIER.JointData;
                            if (type === "fixed") jd = RAPIER.JointData.fixed(A, { x: 0, y: 0, z: 0, w: 1 }, B, { x: 0, y: 0, z: 0, w: 1 });
                            else if (type === "hinge") { jd = RAPIER.JointData.revolute(A, B, { x: ax[0], y: ax[1], z: ax[2] }); if (min < max) { jd.limitsEnabled = true; jd.limits = [min, max]; } }
                            else jd = RAPIER.JointData.spherical(A, B);
                            world.createImpulseJoint(jd, a, b, true);
                            db.store.update(ids.get(r), { _rapierJoint: true });
                        }
                    }

                    // Step on the fixed clock: 0..N steps of `fixedDt` this frame
                    // (decoupled from the render rate). On a stepping frame, snapshot
                    // the pose entering the final step into `_prevPosition`/`_prevRotation`
                    // first, so the pre-render interpolator can blend prev→current.
                    const clock = db.store.resources.physicsClock;
                    const steps = clock.steps;
                    if (steps === 0) return; // no sim time accrued — leave pose + snapshot intact

                    // Drive kinematic bodies to their authored pose: Rapier moves a
                    // position-based kinematic toward the target over the step, deriving
                    // the velocity that pushes dynamics. (Author the pose however you like —
                    // a system, animation, input — the solver just follows it.)
                    for (const arch of db.store.queryArchetypes(KINEMATIC, KINEMATIC_ONLY)) {
                        const ids = arch.columns.id;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const body = bodies.get(ids.get(r));
                            if (!body) continue;
                            const r3 = r * 3, r4 = r * 4;
                            body.setNextKinematicTranslation({ x: pos[r3], y: pos[r3 + 1], z: pos[r3 + 2] });
                            body.setNextKinematicRotation({ x: ori[r4], y: ori[r4 + 1], z: ori[r4 + 2], w: ori[r4 + 3] });
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
                    world.timestep = clock.fixedDt;
                    for (let s = 0; s < steps; s++) world.step();

                    // write the dynamic bodies' new pose + velocity back onto the canonical columns
                    for (const arch of db.store.queryArchetypes(RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        const lv = arch.columns.linearVelocity.getTypedArray(), av = arch.columns.angularVelocity.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            if (!BodyType.isDynamic(bt.get(r))) continue;
                            const body = bodies.get(ids.get(r));
                            if (!body) continue;
                            // PERF residual: rapier3d-compat returns a fresh {x,y,z}/{x,y,z,w}
                            // object from each of these getters → ~4 small allocations per
                            // dynamic body per frame (GC pressure). It scales with the *dynamic*
                            // count only (small for our target), and the compat binding offers
                            // no out-param read, so it's left as-is. If dynamic counts ever get
                            // large, drop to rapier's raw bindings (rawBodies / a flat buffer)
                            // to read straight into our typed arrays with zero allocation.
                            const t = body.translation(), rot = body.rotation(), v = body.linvel(), w = body.angvel();
                            const r3 = r * 3, r4 = r * 4;
                            pos[r3] = t.x; pos[r3 + 1] = t.y; pos[r3 + 2] = t.z;
                            ori[r4] = rot.x; ori[r4 + 1] = rot.y; ori[r4 + 2] = rot.z; ori[r4 + 3] = rot.w;
                            lv[r3] = v.x; lv[r3 + 1] = v.y; lv[r3 + 2] = v.z;
                            av[r3] = w.x; av[r3 + 1] = w.y; av[r3 + 2] = w.z;
                        }
                    }
                };
            },
        },
    },
});
