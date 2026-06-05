// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { Quat } from "@adobe/data/math";
import { pbrRender, rapierSolver, joltSolver, shapeGeometry, physicsRenderBridge, modelCollider, ColliderShape, Orbit } from "@adobe/data-gpu";

// Studio HDR for IBL © Poly Haven, CC0.
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";
// DamagedHelmet glTF © Khronos Group, CC-BY 4.0 — dropped as a dynamic body whose
// convex-hull collider is auto-generated from its mesh (modelCollider).
const HELMET_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

// Scene config. The bin is split into two zones so the moving bar doesn't
// demolish the stack: the **right** half holds the stable stack; the **left**
// half is the dynamic playground (sweeping bar + ramp). Drops rain across the
// whole bin, so some land on the stack while the bar — confined to the left —
// never reaches it.
const BIN = 12;                // half-extent of the floor / containing walls
const STACK_W = 4, STACK_D = 4, STACK_H = 4;   // dynamic block stack (unit cubes)
const STACK_CX = 6.5;          // stack sits in the right zone, clear of the bar
const SPAWN_INTERVAL = 0.18;   // seconds between dynamic drops
const SPAWN_DELAY = 2.5;       // let the bare stack settle first, to verify it holds
const DYNAMIC_CAP = 120;       // stop spawning at this many dropped bodies
const SPAWN_CX = 1.0;          // drops rain across the whole bin — some top the stack
const SPAWN_SPREAD = 8.0;      // (right), the rest feed the bar + ramp (left)
const SPAWN_HEIGHT = 14;
// Kinematic bar: sweeps only the left zone (centre −4.5 ± 4.5 ⇒ x ∈ [−9, 0]), so
// it churns the dropped bodies and ramp without ever reaching the stack at +6.5.
const SWEEP_CX = -4.5, SWEEP_AMP = 4.5, SWEEP_SPEED = 0.7, SWEEP_Y = 1.0;
const IDENTITY: [number, number, number, number] = [...Quat.identity];

/**
 * One deterministic drop. The sequence is precomputed from a fixed seed so that
 * two services running different solvers (Rapier vs Jolt) get the *identical*
 * scene — a fair side-by-side comparison.
 */
interface Drop { shape: ColliderShape; he: [number, number, number]; pos: [number, number, number]; quat: [number, number, number, number]; points?: Float32Array; }

function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function randomQuat(r: () => number): [number, number, number, number] {
    const u1 = r(), u2 = r(), u3 = r();
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)];
}
/** A small cloud of points scattered near a sphere's surface — the solver hulls
 *  it into a random convex polyhedron (gem-like). */
function randomHullPoints(r: () => number, count: number, radius: number): Float32Array {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const u = r() * 2 - 1, theta = r() * 2 * Math.PI, s = Math.sqrt(1 - u * u), rad = radius * (0.7 + 0.3 * r());
        out[i * 3] = rad * s * Math.cos(theta); out[i * 3 + 1] = rad * u; out[i * 3 + 2] = rad * s * Math.sin(theta);
    }
    return out;
}
const DROPS: Drop[] = (() => {
    const r = seededRng(0x1234abcd), out: Drop[] = [];
    for (let i = 0; i < DYNAMIC_CAP; i++) {
        const k = r();
        const shape: ColliderShape = k < 0.28 ? "box" : k < 0.5 ? "capsule" : k < 0.72 ? "hull" : "sphere";
        // box: 3 half-extents; capsule: [radius, cyl half-height]; hull: halfExtents unused; sphere: [radius]
        const he: [number, number, number] = shape === "box" ? [0.3 + r() * 0.3, 0.3 + r() * 0.3, 0.3 + r() * 0.3]
            : shape === "capsule" ? [0.28 + r() * 0.15, 0.35 + r() * 0.35, 0]
                : [0.3 + r() * 0.4, 0, 0];
        out.push({
            shape, he,
            pos: [SPAWN_CX + (r() * 2 - 1) * SPAWN_SPREAD, SPAWN_HEIGHT, (r() * 2 - 1) * SPAWN_SPREAD],
            quat: shape === "sphere" ? [0, 0, 0, 1] : randomQuat(r),
            points: shape === "hull" ? randomHullPoints(r, 9, 0.45 + r() * 0.2) : undefined,
        });
    }
    return out;
})();

/**
 * rigid-stack scene — a 4×4×4 dynamic wood stack rests on a stone floor inside a
 * walled bin; mixed-material bodies drop in and knock it around, rendered
 * through the unified PBR + IBL path. Floor and walls are immovable
 * `StaticCollider` boxes; every body becomes renderable via `physicsRenderBridge`.
 *
 * This **base** plugin is solver-agnostic — scene + spawning only. A solver is
 * combined in below (`rapierSolver` or `joltSolver`); the same scene runs on
 * either through the shared `physicsData` seam, so the two are compared side by
 * side. The drop sequence is deterministic (seeded), so both see it identically.
 */
const rigidStackScene = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrRender, shapeGeometry, physicsRenderBridge, modelCollider, Orbit.plugin),
    resources: {
        _spawnAccum: { default: 0 as number, transient: true },
        _spawnElapsed: { default: 0 as number, transient: true },
        _spawnedDynamic: { default: 0 as number, transient: true },
        _sweeper: { default: 0 as Entity, transient: true }, // the kinematic bar
    },
    transactions: {
        initializeScene(t) {
            t.resources.orbit = {
                ...t.resources.orbit,
                center: [0, 1, 0], radius: 30, height: 22, autoSpinSpeed: 0.12,
            };
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: ENV_URL,
                direction: [-2, -5, -3], color: [1.0, 0.98, 0.92], ambientStrength: 0.4,
            };
            // Stone bin: a floor slab (top face at y = 0) and four walls, all
            // immovable StaticCollider boxes. The render bridge gives them
            // geometry once the shape meshes load — no separate render-only prop.
            const stone = t.resources.materials.stone;
            const wall = (position: [number, number, number], halfExtents: [number, number, number]) =>
                t.archetypes.StaticCollider.insert({ colliderShape: "box", halfExtents, material: stone, position, rotation: IDENTITY });
            wall([0, -0.5, 0], [BIN + 1, 0.5, BIN + 1]);             // floor slab (top at y = 0)
            const WH = 3;                                            // wall half-height (walls 0 → 2·WH)
            wall([ BIN, WH, 0], [0.5, WH, BIN + 1]);                 // +x
            wall([-BIN, WH, 0], [0.5, WH, BIN + 1]);                 // −x
            wall([0, WH,  BIN], [BIN + 1, WH, 0.5]);                 // +z
            wall([0, WH, -BIN], [BIN + 1, WH, 0.5]);                 // −z
            // A static triangle-mesh ramp (level geometry) leaning into one corner —
            // dropped bodies land on it and slide down. World-space verts; up-facing
            // winding so it renders (front faces) and collides (trimesh is two-sided).
            t.archetypes.MeshCollider.insert({
                colliderShape: "mesh", halfExtents: [0, 0, 0], material: t.resources.materials.steel,
                position: [0, 0, 0], rotation: IDENTITY,
                colliderMesh: {
                    // sloped quad in the left zone: high at the −x wall, low toward centre
                    positions: new Float32Array([-BIN + 1.5, 4.5, 6, -BIN + 1.5, 4.5, -6, -1, 0.6, -6, -1, 0.6, 6]),
                    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
                },
            });
            // Dynamic block stack: a grid of unit cubes resting on the floor.
            // A small gap on every axis avoids initial face-coincidence
            // (degenerate SAT normals); they settle into contact.
            const wood = t.resources.materials.wood;
            const GAP = 1.04;
            const x0 = -(STACK_W - 1) / 2 * GAP, z0 = -(STACK_D - 1) / 2 * GAP;
            for (let y = 0; y < STACK_H; y++) {
                for (let x = 0; x < STACK_W; x++) {
                    for (let z = 0; z < STACK_D; z++) {
                        t.archetypes.RigidBody.insert({
                            bodyType: "dynamic", colliderShape: "box", halfExtents: [0.5, 0.5, 0.5], material: wood,
                            position: [STACK_CX + x0 + x * GAP, 0.55 + y * 1.04, z0 + z * GAP],
                            rotation: IDENTITY, linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
                        });
                    }
                }
            }
            // A kinematic steel bar that sweeps across the bin, plowing the stack —
            // its pose is authored each frame by the `sweep` system; the solver moves
            // it as a kinematic body that pushes the dynamics but is never pushed back.
            t.resources._sweeper = t.archetypes.RigidBody.insert({
                bodyType: "kinematic", colliderShape: "box", halfExtents: [0.4, 1.0, BIN - 1], material: t.resources.materials.steel,
                position: [SWEEP_CX - SWEEP_AMP, SWEEP_Y, 0], rotation: IDENTITY, linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
            });
            // A downloaded glTF model dropped as dynamic bodies: it renders in full
            // detail but collides as a convex hull auto-generated from its mesh
            // (colliderShape "hull" + no collision data ⇒ modelCollider fills it). One
            // shared Geometry, three staggered instances. (To hand-author the collider
            // instead, pass `convexPoints`/`colliderMesh` here and generation is skipped.)
            const helmet = t.archetypes.Geometry.insert({ modelUrl: HELMET_URL });
            for (let i = 0; i < 3; i++) {
                t.archetypes.ModelBody.insert({
                    geometry: helmet, scale: [1.5, 1.5, 1.5], visible: true, parent: 0,
                    bodyType: "dynamic", colliderShape: "hull", halfExtents: [0, 0, 0], material: t.resources.materials.steel,
                    position: [SPAWN_CX - 2 + i * 2, 15 + i * 5, -1 + i],
                    rotation: randomQuat(seededRng(0x5eed + i)), linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
                });
            }
        },
        spawnBody(t, args: { index: number }) {
            const d = DROPS[args.index];
            const material = Object.values(t.resources.materials)[args.index % Object.keys(t.resources.materials).length];
            const common = {
                bodyType: "dynamic" as const, colliderShape: d.shape, halfExtents: d.he, material,
                position: d.pos, rotation: d.quat, linearVelocity: [0, 0, 0] as [number, number, number], angularVelocity: [0, 0, 0] as [number, number, number],
            };
            // hull bodies carry their authored point cloud (the ConvexBody archetype)
            if (d.shape === "hull" && d.points) t.archetypes.ConvexBody.insert({ ...common, convexPoints: d.points });
            else t.archetypes.RigidBody.insert(common);
        },
    },
    systems: {
        // Drop a dynamic body every SPAWN_INTERVAL until the cap.
        spawner: {
            schedule: { during: ["update"] },
            create: db => () => {
                if (db.store.resources._spawnedDynamic >= DYNAMIC_CAP) return;
                const dt = db.store.resources.frameTime.dt;
                const elapsed = db.store.resources._spawnElapsed + dt;
                db.store.resources._spawnElapsed = elapsed;
                if (elapsed < SPAWN_DELAY) return;
                let accum = db.store.resources._spawnAccum + dt;
                while (accum >= SPAWN_INTERVAL && db.store.resources._spawnedDynamic < DYNAMIC_CAP) {
                    accum -= SPAWN_INTERVAL;
                    db.transactions.spawnBody({ index: db.store.resources._spawnedDynamic });
                    db.store.resources._spawnedDynamic = db.store.resources._spawnedDynamic + 1;
                }
                db.store.resources._spawnAccum = accum;
            },
        },
        // Author the kinematic bar's pose: a horizontal sweep along x. The solver
        // reads this pose and drives the kinematic body to it each step.
        sweep: {
            schedule: { during: ["update"] },
            create: db => () => {
                const id = db.store.resources._sweeper;
                if (!id) return;
                const x = SWEEP_CX + Math.sin(db.store.resources.frameTime.elapsed * SWEEP_SPEED - Math.PI / 2) * SWEEP_AMP;
                db.store.update(id, { position: [x, SWEEP_Y, 0] });
            },
        },
    },
});

export const rigidStackRapierPlugin = Database.Plugin.combine(rigidStackScene, rapierSolver);
export const rigidStackJoltPlugin = Database.Plugin.combine(rigidStackScene, joltSolver);
