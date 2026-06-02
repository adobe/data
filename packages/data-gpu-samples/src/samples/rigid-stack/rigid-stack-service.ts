// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat } from "@adobe/data/math";
import { pbrRender, cpuXpbd, shapeGeometry, physicsRenderBridge, Orbit } from "@adobe/data-gpu";

// Studio HDR for IBL © Poly Haven, CC0.
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

// Scene config.
const BIN = 7;                 // half-extent of the floor / containing walls
const STACK_W = 4, STACK_D = 4, STACK_H = 4;   // dynamic block stack (unit cubes)
const SPAWN_INTERVAL = 0.18;   // seconds between dynamic drops
const SPAWN_DELAY = 2.5;       // let the bare stack settle first, to verify it holds
const DYNAMIC_CAP = 200;       // stop spawning at this many dropped bodies
const SPAWN_SPREAD = 2.5;      // ± x/z spawn area (roughly over the stack)
const SPAWN_HEIGHT = 14;

/**
 * rigid-stack — CPU-XPBD physics rendered through the unified PBR + IBL path.
 * A 4×4×4 dynamic wood stack rests on a stone floor; mixed-material bodies drop
 * in and knock it around. Bodies become renderable via `physicsRenderBridge`
 * (geometry by shape, scale from half-extents); the floor is a render-only
 * `Prop`. Swap `pbrRender` for `rigidStackDebugRender` to use the flat shader.
 */
export const rigidStackPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrRender, cpuXpbd, shapeGeometry, physicsRenderBridge, Orbit.plugin),
    resources: {
        _spawnAccum: { default: 0 as number, transient: true },
        _spawnElapsed: { default: 0 as number, transient: true },
        _spawnedDynamic: { default: 0 as number, transient: true },
        _spawnLastTime: { default: 0 as number, transient: true },
        _floorDone: { default: false as boolean, transient: true },
    },
    transactions: {
        initializeScene(t) {
            t.resources.cpuPhysicsConfig = {
                ...t.resources.cpuPhysicsConfig,
                gravity: 18, floorY: 0, binExtent: BIN,
                substeps: 10, iterations: 1,  // Small-Steps: narrowphase once per substep
                restitutionThreshold: 1.5, sleepLinear: 0.5, sleepAngular: 0.6, sleepTime: 0.5,
                worldRestitution: 0.2, worldFriction: 0.6, rollingFriction: 0.2,
            };
            t.resources.orbit = {
                ...t.resources.orbit,
                center: [0, 3, 0], radius: 26, height: 12, autoSpinSpeed: 0.12,
            };
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: ENV_URL,
                direction: [-2, -5, -3], color: [1.0, 0.98, 0.92], ambientStrength: 0.4,
            };
            // Dynamic block stack: a grid of unit cubes resting on the floor.
            // Dynamic so we can verify the solver holds the stack and dropped
            // bodies knock it around. A small gap on every axis avoids initial
            // face-coincidence (degenerate SAT normals); they settle into contact.
            const wood = t.resources.materials.wood;
            const GAP = 1.04; // unit cubes (1.0) spaced with a small gap on every axis
            const x0 = -(STACK_W - 1) / 2 * GAP, z0 = -(STACK_D - 1) / 2 * GAP;
            for (let y = 0; y < STACK_H; y++) {
                for (let x = 0; x < STACK_W; x++) {
                    for (let z = 0; z < STACK_D; z++) {
                        t.archetypes.RigidBody.insert({
                            bodyType: "dynamic",
                            colliderShape: "box",
                            halfExtents: [0.5, 0.5, 0.5],
                            material: wood,
                            position: [x0 + x * GAP, 0.55 + y * 1.04, z0 + z * GAP],
                            rotation: Quat.identity,
                            linearVelocity: [0, 0, 0],
                            angularVelocity: [0, 0, 0],
                        });
                    }
                }
            }
        },
        // Render-only stone floor: a flat cube whose top sits at y = 0 (matching
        // the solver's analytic floor). Inserted once the shape geometry exists.
        insertFloor(t, args: { geometry: number; material: number }) {
            t.archetypes.Prop.insert({
                geometry: args.geometry,
                position: [0, -0.5, 0],
                rotation: Quat.identity,
                scale: [BIN + 1, 0.5, BIN + 1],
                visible: true,
                material: args.material,
            });
        },
        spawnBody(t) {
            const isBox = Math.random() < 0.4;
            const ids = Object.values(t.resources.materials);
            const mat = ids[Math.floor(Math.random() * ids.length)];
            const he: [number, number, number] = isBox
                ? [0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.3]
                : [0.3 + Math.random() * 0.4, 0, 0];
            t.archetypes.RigidBody.insert({
                bodyType: "dynamic",
                colliderShape: isBox ? "box" : "sphere",
                halfExtents: he,
                material: mat,
                position: [(Math.random() * 2 - 1) * SPAWN_SPREAD, SPAWN_HEIGHT, (Math.random() * 2 - 1) * SPAWN_SPREAD],
                rotation: isBox ? randomQuat() : Quat.identity,
                // an initial downward toss so each body clears the spawn point
                // before the next appears (no overlapping pile at the top).
                linearVelocity: [0, -6, 0],
                angularVelocity: [0, 0, 0],
            });
        },
    },
    systems: {
        // Place the stone floor once the shape geometry + materials are ready.
        floorInit: {
            schedule: { during: ["update"] },
            create: db => () => {
                if (db.store.resources._floorDone) return;
                const shapes = db.store.resources._shapeGeometry;
                const stone = db.store.resources.materials.stone;
                if (!shapes || stone === undefined) return;
                db.transactions.insertFloor({ geometry: shapes.cube, material: stone });
                db.store.resources._floorDone = true;
            },
        },
        // Drop a dynamic body every SPAWN_INTERVAL until the cap.
        spawner: {
            schedule: { during: ["update"] },
            create: db => () => {
                if (db.store.resources._spawnedDynamic >= DYNAMIC_CAP) return;
                const now = performance.now();
                const last = db.store.resources._spawnLastTime || now;
                const dt = Math.min((now - last) / 1000, 0.05);
                db.store.resources._spawnLastTime = now;
                const elapsed = db.store.resources._spawnElapsed + dt;
                db.store.resources._spawnElapsed = elapsed;
                if (elapsed < SPAWN_DELAY) return;  // let the bare stack settle + prove stable first
                let accum = db.store.resources._spawnAccum + dt;
                while (accum >= SPAWN_INTERVAL && db.store.resources._spawnedDynamic < DYNAMIC_CAP) {
                    accum -= SPAWN_INTERVAL;
                    db.transactions.spawnBody();
                    db.store.resources._spawnedDynamic = db.store.resources._spawnedDynamic + 1;
                }
                db.store.resources._spawnAccum = accum;
            },
        },
    },
});

function randomQuat(): [number, number, number, number] {
    const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    return [a * Math.sin(2 * Math.PI * u2), a * Math.cos(2 * Math.PI * u2), b * Math.sin(2 * Math.PI * u3), b * Math.cos(2 * Math.PI * u3)];
}
