// © 2026 Adobe. MIT License. See /LICENSE for details.

import RAPIER from "@dimforge/rapier3d-compat";
import { Database, type Entity } from "@adobe/data/ecs";
import { core, physicsData, BodyType, ColliderShape } from "@adobe/data-gpu";

/**
 * A second rigid-body solver behind the same `physicsData` seam — the
 * battle-tested Rapier engine (dimforge, Rust→WASM). It reads the identical
 * authored components (`RigidBody` + `StaticCollider`) and writes back
 * `position`/`rotation`/velocity for dynamic bodies, exactly like `cpuXpbd`, so
 * the same scene runs unchanged on either solver. This both gives us a robust
 * reference and proves the solver seam from *outside* `@adobe/data-gpu` (this
 * plugin only consumes the package's public exports).
 *
 * Rapier's WASM must be initialised before use; per the repo's no-top-level-await
 * rule, the init promise lives in the system closure and is awaited lazily — the
 * system no-ops until the world exists, then runs every frame.
 */

const GRAVITY = 18; // matches the cpuXpbd sample so the two solvers are comparable

const RIGID = ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"] as const;
const STATIC = ["colliderShape", "halfExtents", "material", "position", "rotation"] as const;
const STATIC_EXCLUDE = { exclude: ["linearVelocity"] } as const;

interface MatProps { density: number; restitution: number; friction: number }

export const rapierSolver = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, core),
    systems: {
        rapierStep: {
            schedule: { during: ["physics"] },
            create: db => {
                let world: RAPIER.World | null = null;
                let initStarted = false;
                const bodies = new Map<Entity, RAPIER.RigidBody>(); // entity → Rapier body

                const matPropsOf = (id: Entity): MatProps => {
                    // Material entities carry density/restitution/friction (read once at body creation).
                    const m = db.store.read(id) as { density?: number; restitution?: number; friction?: number } | null;
                    return { density: m?.density ?? 1, restitution: m?.restitution ?? 0.2, friction: m?.friction ?? 0.5 };
                };

                const ensureBody = (id: Entity, dynamic: boolean, shape: ColliderShape, hx: number, hy: number, hz: number, mat: Entity, px: number, py: number, pz: number, q: ArrayLike<number>, vx: number, vy: number, vz: number): void => {
                    if (!world || bodies.has(id)) return;
                    const m = matPropsOf(mat);
                    const desc = dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
                    desc.setTranslation(px, py, pz).setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
                    if (dynamic) desc.setLinvel(vx, vy, vz);
                    const body = world.createRigidBody(desc);
                    const col = shape === "sphere" ? RAPIER.ColliderDesc.ball(hx) : RAPIER.ColliderDesc.cuboid(hx, hy, hz);
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

                    // sync: create a Rapier body for every authored body not yet mirrored
                    for (const arch of db.store.queryArchetypes(RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents.getTypedArray(), pos = arch.columns.position.getTypedArray();
                        const ori = arch.columns.rotation.getTypedArray(), lv = arch.columns.linearVelocity.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const id = ids.get(r);
                            if (bodies.has(id)) continue;
                            const r3 = r * 3, r4 = r * 4;
                            ensureBody(id, BodyType.isDynamic(bt.get(r)), cs.get(r), he[r3], he[r3 + 1], he[r3 + 2], mat.get(r), pos[r3], pos[r3 + 1], pos[r3 + 2], [ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]], lv[r3], lv[r3 + 1], lv[r3 + 2]);
                        }
                    }
                    for (const arch of db.store.queryArchetypes(STATIC, STATIC_EXCLUDE)) {
                        const ids = arch.columns.id, cs = arch.columns.colliderShape, mat = arch.columns.material;
                        const he = arch.columns.halfExtents.getTypedArray(), pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            const id = ids.get(r);
                            if (bodies.has(id)) continue;
                            const r3 = r * 3, r4 = r * 4;
                            ensureBody(id, false, cs.get(r), he[r3], he[r3 + 1], he[r3 + 2], mat.get(r), pos[r3], pos[r3 + 1], pos[r3 + 2], [ori[r4], ori[r4 + 1], ori[r4 + 2], ori[r4 + 3]], 0, 0, 0);
                        }
                    }

                    world.timestep = db.store.resources.frameTime.dt < 0.033 ? db.store.resources.frameTime.dt : 0.033;
                    world.step();

                    // write the dynamic bodies' new pose + velocity back onto the canonical columns
                    for (const arch of db.store.queryArchetypes(RIGID)) {
                        const ids = arch.columns.id, bt = arch.columns.bodyType;
                        const pos = arch.columns.position.getTypedArray(), ori = arch.columns.rotation.getTypedArray();
                        const lv = arch.columns.linearVelocity.getTypedArray(), av = arch.columns.angularVelocity.getTypedArray();
                        for (let r = 0; r < arch.rowCount; r++) {
                            if (!BodyType.isDynamic(bt.get(r))) continue;
                            const body = bodies.get(ids.get(r));
                            if (!body) continue;
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
