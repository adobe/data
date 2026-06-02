// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { core } from "../../../core/core-plugin.js";
import { physicsData } from "../../physics-data-plugin.js";
import { BodyType } from "../../body/body-type/body-type.js";
import { ColliderShape } from "../../body/collider-shape/collider-shape.js";
import { Material } from "../../../material/material.js";
import { createSolverState, step, type SolverConfig, type SolverState } from "./cpu-solver.js";

/** Physical props the solver reads off a referenced Material entity. */
interface MatProps { density: number; restitution: number; friction: number }

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

const _v3: [number, number, number] = [0, 0, 0];
const _v4: [number, number, number, number] = [0, 0, 0, 0];

export const cpuXpbd = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, core, Material.plugin),
    resources: {
        cpuPhysicsConfig: {
            default: {
                gravity: 18,
                substeps: 8,
                iterations: 4,
                restitutionThreshold: 1.5,
                sleepLinear: 0.2,
                sleepAngular: 0.2,
                worldRestitution: 0.2,
                worldFriction: 0.6,
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
                let lastTime = 0;
                // Material props keyed by entity. Materials are added rarely and
                // edited never, so the lookup is rebuilt only when the count of
                // material entities changes — steady state does no material work.
                let matProps = new Map<number, MatProps>();
                let matCount = -1;
                return () => {
                    const now = performance.now();
                    const last = lastTime || now;
                    const dt = Math.min((now - last) / 1000, 0.033);
                    lastTime = now;
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
                    for (const arch of db.store.queryArchetypes(["name", "density", "restitution", "friction"])) mc += arch.rowCount;
                    if (mc !== matCount) {
                        matProps = new Map();
                        for (const arch of db.store.queryArchetypes(["name", "density", "restitution", "friction"])) {
                            const id = arch.columns.id, d = arch.columns.density, rs = arch.columns.restitution, fr = arch.columns.friction;
                            for (let r = 0; r < arch.rowCount; r++) {
                                matProps.set(id.get(r), { density: d.get(r), restitution: rs.get(r), friction: fr.get(r) });
                            }
                        }
                        matCount = mc;
                    }

                // --- gather: ECS columns → flat arrays -------------------------
                let i = 0;
                for (const arch of db.store.queryArchetypes(COMPONENTS)) {
                    const bt = arch.columns.bodyType, cs = arch.columns.colliderShape, he = arch.columns.halfExtents;
                    const mat = arch.columns.material, pos = arch.columns.position, ori = arch.columns.rotation;
                    const lv = arch.columns.linearVelocity, av = arch.columns.angularVelocity;
                    for (let r = 0; r < arch.rowCount; r++, i++) {
                        const dyn = BodyType.isDynamic(bt.get(r));
                        const shape = ColliderShape.toIndex(cs.get(r));
                        const e = he.get(r);
                        const m = matProps.get(mat.get(r));
                        const density = m ? m.density : 1;
                        const p = pos.get(r), q = ori.get(r), v = lv.get(r), w = av.get(r);
                        state.dynamic[i] = dyn ? 1 : 0;
                        state.shape[i] = shape;
                        state.halfExtent[i * 3] = e[0]; state.halfExtent[i * 3 + 1] = e[1]; state.halfExtent[i * 3 + 2] = e[2];
                        state.pos[i * 3] = p[0]; state.pos[i * 3 + 1] = p[1]; state.pos[i * 3 + 2] = p[2];
                        state.orient[i * 4] = q[0]; state.orient[i * 4 + 1] = q[1]; state.orient[i * 4 + 2] = q[2]; state.orient[i * 4 + 3] = q[3];
                        state.vel[i * 3] = v[0]; state.vel[i * 3 + 1] = v[1]; state.vel[i * 3 + 2] = v[2];
                        state.angVel[i * 3] = w[0]; state.angVel[i * 3 + 1] = w[1]; state.angVel[i * 3 + 2] = w[2];
                        state.restitution[i] = m ? m.restitution : 0.2;
                        state.friction[i] = m ? m.friction : 0.5;
                        if (dyn) {
                            const mp = ColliderShape.massProperties(cs.get(r), e, density);
                            state.invMass[i] = mp.inverseMass;
                            state.invInertia[i * 3] = mp.inverseInertia[0]; state.invInertia[i * 3 + 1] = mp.inverseInertia[1]; state.invInertia[i * 3 + 2] = mp.inverseInertia[2];
                        } else {
                            state.invMass[i] = 0;
                            state.invInertia[i * 3] = 0; state.invInertia[i * 3 + 1] = 0; state.invInertia[i * 3 + 2] = 0;
                        }
                    }
                }
                state.count = i;

                step(state, dt, db.store.resources.cpuPhysicsConfig);

                // --- scatter: dynamic bodies → ECS columns (re-query, same order) ---
                let j = 0;
                for (const arch of db.store.queryArchetypes(COMPONENTS)) {
                    const pos = arch.columns.position, ori = arch.columns.rotation;
                    const lv = arch.columns.linearVelocity, av = arch.columns.angularVelocity;
                    for (let r = 0; r < arch.rowCount; r++, j++) {
                        const idx = j;
                        if (state.dynamic[idx] === 0) continue;
                        _v3[0] = state.pos[idx * 3]; _v3[1] = state.pos[idx * 3 + 1]; _v3[2] = state.pos[idx * 3 + 2]; pos.set(r, _v3);
                        _v4[0] = state.orient[idx * 4]; _v4[1] = state.orient[idx * 4 + 1]; _v4[2] = state.orient[idx * 4 + 2]; _v4[3] = state.orient[idx * 4 + 3]; ori.set(r, _v4);
                        _v3[0] = state.vel[idx * 3]; _v3[1] = state.vel[idx * 3 + 1]; _v3[2] = state.vel[idx * 3 + 2]; lv.set(r, _v3);
                        _v3[0] = state.angVel[idx * 3]; _v3[1] = state.angVel[idx * 3 + 1]; _v3[2] = state.angVel[idx * 3 + 2]; av.set(r, _v3);
                    }
                }
                };
            },
        },
    },
});
