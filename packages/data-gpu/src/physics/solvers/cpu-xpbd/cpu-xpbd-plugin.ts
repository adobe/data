// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../../../core/core-plugin.js";
import { physicsData } from "../../physics-data-plugin.js";
import { BodyType } from "../../body/body-type/body-type.js";
import { ColliderShape } from "../../body/collider-shape/collider-shape.js";
import { Material } from "../../../material/material.js";
import { createSolverState, step, type SolverConfig, type SolverState } from "./cpu-solver.js";

/** Physical props the solver reads off a referenced Material entity. */
interface MatProps { density: number; restitution: number; friction: number; compliance: number }

/**
 * CPU sequential-XPBD rigid-body solver — the first solver behind the shared
 * `physicsData` seam. Each frame it gathers the RigidBody columns into flat
 * arrays, runs the sequential (Gauss-Seidel) solver, and scatters the updated
 * pose + velocity back onto dynamic bodies. Static/kinematic bodies are
 * colliders only (inverse mass 0, never integrated, never written back).
 *
 * Mass + inertia are derived per body from shape + material density. Combine
 * with `physicsData` (and a renderer that reads the canonical transforms) to run
 * a scene; swap this plugin for another solver without touching the data.
 */

const COMPONENTS = ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"] as const;

export const cpuXpbd = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, core, Material.plugin),
    resources: {
        cpuPhysicsConfig: {
            default: {
                gravity: 18,
                substeps: 8,
                iterations: 4,
                restitutionThreshold: 1.5,
                sleepLinear: 0.5,
                sleepAngular: 0.6,
                sleepTime: 0.5,
                worldRestitution: 0.2,
                worldFriction: 0.6,
                rollingFriction: 0.2,
                floorY: 0,
                binExtent: 0,
            } satisfies SolverConfig as SolverConfig,
        },
    },
    systems: {
        cpuPhysicsStep: {
            schedule: { during: ["physics"] },
            // Mutable solver state lives in a closure (resources are returned
            // deep-readonly, which would block writing the flat Float32Arrays).
            create: db => {
                let state: SolverState | null = null;
                // Material props keyed by entity. Materials are added rarely and
                // edited never, so the lookup is rebuilt only when the count of
                // material entities changes — steady state does no material work.
                let matProps = new Map<number, MatProps>();
                let matCount = -1;
                return () => {
                    // Clamp below the frame clock's own cap: the sequential XPBD
                    // solve needs a tighter bound (~30 fps) to stay stable.
                    const frameDt = db.store.resources.frameTime.dt;
                    const dt = frameDt < 0.033 ? frameDt : 0.033;
                    if (dt <= 0) return;

                    // count bodies, (re)allocate state if needed
                    let total = 0;
                    for (const arch of db.store.queryArchetypes(COMPONENTS)) total += arch.rowCount;
                    if (total === 0) return;
                    if (!state || state.pos.length < total * 3) {
                        state = createSolverState(Math.max(total, 256));
                    }

                    // refresh the material lookup only when the material set changes
                    let mc = 0;
                    for (const arch of db.store.queryArchetypes(["name", "density", "restitution", "friction", "compliance"])) mc += arch.rowCount;
                    if (mc !== matCount) {
                        matProps = new Map();
                        for (const arch of db.store.queryArchetypes(["name", "density", "restitution", "friction", "compliance"])) {
                            const id = arch.columns.id, d = arch.columns.density, rs = arch.columns.restitution, fr = arch.columns.friction, co = arch.columns.compliance;
                            for (let r = 0; r < arch.rowCount; r++) {
                                matProps.set(id.get(r), { density: d.get(r), restitution: rs.get(r), friction: fr.get(r), compliance: co.get(r) });
                            }
                        }
                        matCount = mc;
                    }

                // --- gather: ECS columns → flat arrays -------------------------
                // Direct typed-array access: Vec3/Quat columns are flat Float32Array
                // struct buffers, so `getTypedArray()` + indexing avoids the per-row
                // array allocation that `column.get(r)` does (GC churn at 60fps).
                let i = 0;
                for (const arch of db.store.queryArchetypes(COMPONENTS)) {
                    const bt = arch.columns.bodyType, cs = arch.columns.colliderShape, mat = arch.columns.material;
                    const heArr = arch.columns.halfExtents.getTypedArray();
                    const posArr = arch.columns.position.getTypedArray();
                    const oriArr = arch.columns.rotation.getTypedArray();
                    const lvArr = arch.columns.linearVelocity.getTypedArray();
                    const avArr = arch.columns.angularVelocity.getTypedArray();
                    for (let r = 0; r < arch.rowCount; r++, i++) {
                        const shape = cs.get(r);
                        const dyn = BodyType.isDynamic(bt.get(r));
                        const m = matProps.get(mat.get(r));
                        const r3 = r * 3, r4 = r * 4, i3 = i * 3, i4 = i * 4;
                        const hx = heArr[r3], hy = heArr[r3 + 1], hz = heArr[r3 + 2];
                        state.dynamic[i] = dyn ? 1 : 0;
                        state.shape[i] = ColliderShape.toIndex(shape);
                        state.halfExtent[i3] = hx; state.halfExtent[i3 + 1] = hy; state.halfExtent[i3 + 2] = hz;
                        state.pos[i3] = posArr[r3]; state.pos[i3 + 1] = posArr[r3 + 1]; state.pos[i3 + 2] = posArr[r3 + 2];
                        state.orient[i4] = oriArr[r4]; state.orient[i4 + 1] = oriArr[r4 + 1]; state.orient[i4 + 2] = oriArr[r4 + 2]; state.orient[i4 + 3] = oriArr[r4 + 3];
                        state.vel[i3] = lvArr[r3]; state.vel[i3 + 1] = lvArr[r3 + 1]; state.vel[i3 + 2] = lvArr[r3 + 2];
                        state.angVel[i3] = avArr[r3]; state.angVel[i3 + 1] = avArr[r3 + 1]; state.angVel[i3 + 2] = avArr[r3 + 2];
                        state.restitution[i] = m ? m.restitution : 0.2;
                        state.friction[i] = m ? m.friction : 0.5;
                        state.compliance[i] = m ? m.compliance : 0;
                        if (dyn) {
                            state.invMass[i] = ColliderShape.massProperties(shape, hx, hy, hz, m ? m.density : 1, state.invInertia, i3);
                        } else {
                            state.invMass[i] = 0;
                            state.invInertia[i3] = 0; state.invInertia[i3 + 1] = 0; state.invInertia[i3 + 2] = 0;
                        }
                    }
                }
                state.count = i;

                step(state, dt, db.store.resources.cpuPhysicsConfig);

                // --- scatter: dynamic bodies → ECS columns (re-query, same order) ---
                // Direct typed-array writes — no transaction, no per-row allocation.
                let j = 0;
                for (const arch of db.store.queryArchetypes(COMPONENTS)) {
                    const posArr = arch.columns.position.getTypedArray();
                    const oriArr = arch.columns.rotation.getTypedArray();
                    const lvArr = arch.columns.linearVelocity.getTypedArray();
                    const avArr = arch.columns.angularVelocity.getTypedArray();
                    for (let r = 0; r < arch.rowCount; r++, j++) {
                        if (state.dynamic[j] === 0) continue;
                        const r3 = r * 3, r4 = r * 4, j3 = j * 3, j4 = j * 4;
                        posArr[r3] = state.pos[j3]; posArr[r3 + 1] = state.pos[j3 + 1]; posArr[r3 + 2] = state.pos[j3 + 2];
                        oriArr[r4] = state.orient[j4]; oriArr[r4 + 1] = state.orient[j4 + 1]; oriArr[r4 + 2] = state.orient[j4 + 2]; oriArr[r4 + 3] = state.orient[j4 + 3];
                        lvArr[r3] = state.vel[j3]; lvArr[r3 + 1] = state.vel[j3 + 1]; lvArr[r3 + 2] = state.vel[j3 + 2];
                        avArr[r3] = state.angVel[j3]; avArr[r3 + 1] = state.angVel[j3 + 1]; avArr[r3 + 2] = state.angVel[j3 + 2];
                    }
                }
                };
            },
        },
    },
});
