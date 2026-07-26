// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, beforeAll } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { Line3 } from "@adobe/data/math";
import { rapierSolver } from "./rapier-solver-plugin.js";
import { joltSolver } from "./jolt-solver-plugin.js";
import type { PhysicsHit } from "../physics-hit.js";

/**
 * Abstract picking conformance suite: the SAME expected outcomes are asserted
 * against every solver behind the `physicsData` seam. Building a fixed static
 * scene and running identical `pickRay` calls proves both engines fulfil the
 * `PhysicsQuery` contract interchangeably (entity, parametric α, hit point,
 * and a ray-opposing normal), including the with/without-radius variants.
 *
 *   npx vitest --run src/physics/solvers/pick-ray-conformance.test.ts
 */

// The solver plugin extends `physicsData`, so the StaticCollider archetype, the
// `frameTime` resource, and the `pickRay` action all exist on the created db.
// The scene is driven dynamically, so the db is used through a loose shape
// (runtime invariant: these members exist on any physicsData solver).
interface LooseDb {
    store: {
        archetypes: Record<string, { insert(v: unknown): number }>;
        resources: Record<string, unknown>;
    };
    system: { functions: Record<string, () => unknown>; order?: string[][] };
    actions: {
        pickRay(args: { ray: Line3; radius?: number }): PhysicsHit | null;
        pickRayEach(args: { ray: Line3; visit: (hit: PhysicsHit) => boolean | void; radius?: number }): void;
    };
}

const yieldToEventLoop = () => new Promise<void>(r => setTimeout(r, 0));

interface Scene { db: LooseDb; floor: number; ball: number; box: number }

// Build a fixed scene of static colliders and drive the sim until the solver's
// WASM world is live, the bodies are mirrored, and the query pipeline is
// populated (both engines need at least one step for that). Picks are read-only,
// so one scene is shared across all cases for a solver.
async function buildScene(solver: Database.Plugin): Promise<Scene> {
    const db = Database.create(solver) as unknown as LooseDb;

    // Floor: wide thick box, top face at y = 0.
    const floor = db.store.archetypes.StaticCollider.insert({
        colliderShape: "box", halfExtents: [10, 1, 10], material: 0,
        position: [0, -1, 0], rotation: [0, 0, 0, 1],
    });
    // Sphere radius 1 centred at (0, 3, 0) → top at y = 4.
    const ball = db.store.archetypes.StaticCollider.insert({
        colliderShape: "sphere", halfExtents: [1, 0, 0], material: 0,
        position: [0, 3, 0], rotation: [0, 0, 0, 1],
    });
    // Unit box centred at (5, 3, 0) → top at y = 4, off to the side.
    const box = db.store.archetypes.StaticCollider.insert({
        colliderShape: "box", halfExtents: [1, 1, 1], material: 0,
        position: [5, 3, 0], rotation: [0, 0, 0, 1],
    });

    const order = db.system.order;
    const names = order ? order.flat() : Object.keys(db.system.functions);
    const runNames = names.filter(n => n !== "_frameTime" && n !== "schedulerSystem");
    const dt = 1 / 60;
    const tick = (f: number): void => {
        db.store.resources.frameTime = { now: f * dt * 1000, dt, elapsed: f * dt };
        for (const n of runNames) { const fn = db.system.functions[n]; if (fn) fn(); }
    };

    // Drive until the solver publishes its query, then a few more steps so the
    // bodies are mirrored and the broad/narrow phase is populated.
    let f = 0;
    for (; f < 300 && db.store.resources.physicsQuery == null; f++) { tick(f); await yieldToEventLoop(); }
    for (let k = 0; k < 30; k++, f++) { tick(f); await yieldToEventLoop(); }

    return { db, floor, ball, box };
}

function describePicking(name: string, solver: Database.Plugin): void {
    describe(`pickRay conformance — ${name}`, () => {
        let scene: Scene;
        beforeAll(async () => { scene = await buildScene(solver); }, 60_000);

        it("publishes a physicsQuery once the world is live", () => {
            expect((scene.db.store.resources as { physicsQuery: unknown }).physicsQuery).not.toBeNull();
        });

        it("hits the sphere with a ray straight down through its centre", () => {
            // segment y: 10 → −10 (span 20); sphere top at y = 4 ⇒ α = (10 − 4) / 20 = 0.3
            const ray: Line3 = { a: [0, 10, 0], b: [0, -10, 0] };
            const hit = scene.db.actions.pickRay({ ray });
            expect(hit).not.toBeNull();
            expect(hit!.entity).toBe(scene.ball);
            expect(hit!.distance).toBeCloseTo(0.3, 1);
            expect(hit!.point[1]).toBeCloseTo(4, 1);
            // ray points down, so the surface normal points up (opposes the ray)
            expect(hit!.normal[1]).toBeGreaterThan(0.5);
        });

        it("hits the box off to the side", () => {
            const ray: Line3 = { a: [5, 10, 0], b: [5, -10, 0] };
            const hit = scene.db.actions.pickRay({ ray });
            expect(hit).not.toBeNull();
            expect(hit!.entity).toBe(scene.box);
            expect(hit!.point[1]).toBeCloseTo(4, 1); // box top face
            expect(hit!.normal[1]).toBeGreaterThan(0.5);
        });

        it("returns the nearest collider when several lie along the ray", () => {
            // straight down through the centre passes the sphere (top y = 4) before
            // the floor (top y = 0) → the nearer sphere wins
            const hit = scene.db.actions.pickRay({ ray: { a: [0, 10, 0], b: [0, -10, 0] } });
            expect(hit!.entity).toBe(scene.ball);
        });

        it("returns null when the ray misses every collider", () => {
            const ray: Line3 = { a: [100, 10, 100], b: [100, -10, 100] };
            expect(scene.db.actions.pickRay({ ray })).toBeNull();
        });

        it("with/without radius: a grazing ray misses as a line but hits as a thick ray", () => {
            // Short segment offset 1.4 in x from the sphere centre, kept above the
            // floor (y: 5 → 2.5). As a thin line it clears the sphere (1.4 > radius 1)
            // and never reaches the floor → miss. A 0.5-radius sweep has effective
            // reach 1.5 > 1.4 → it grazes the sphere.
            const ray: Line3 = { a: [1.4, 5, 0], b: [1.4, 2.5, 0] };
            expect(scene.db.actions.pickRay({ ray })).toBeNull();

            const hit = scene.db.actions.pickRay({ ray, radius: 0.5 });
            expect(hit).not.toBeNull();
            expect(hit!.entity).toBe(scene.ball);
            expect(hit!.distance).toBeGreaterThanOrEqual(0);
            expect(hit!.distance).toBeLessThanOrEqual(1);
        });

        it("castRayEach visits every collider along the ray, nearest first", () => {
            // straight down at x = 0 crosses the sphere (top y = 4, α = 0.3) then the
            // floor (top y = 0, α = 0.5); the box at x = 5 is not on the ray
            const seen: number[] = [];
            const dists: number[] = [];
            scene.db.actions.pickRayEach({
                ray: { a: [0, 10, 0], b: [0, -10, 0] },
                visit: (h) => { seen.push(h.entity); dists.push(h.distance); },
            });
            expect(seen).toEqual([scene.ball, scene.floor]);
            expect(dists).toEqual([...dists].sort((x, y) => x - y)); // ascending
        });

        it("castRayEach stops early when visit returns false", () => {
            const seen: number[] = [];
            scene.db.actions.pickRayEach({
                ray: { a: [0, 10, 0], b: [0, -10, 0] },
                visit: (h) => { seen.push(h.entity); return false; }, // stop after the nearest
            });
            expect(seen).toEqual([scene.ball]);
        });

        it("castRayEach visits nothing when the ray misses everything", () => {
            let count = 0;
            scene.db.actions.pickRayEach({
                ray: { a: [100, 10, 100], b: [100, -10, 100] },
                visit: () => { count++; },
            });
            expect(count).toBe(0);
        });

        it("castRayEach with radius visits at least the nearest swept hit on every solver", () => {
            // The Rapier compat binding can't sweep-all, so radius degrades to the
            // nearest there; Jolt returns all. Both must at least visit the nearest.
            const seen: number[] = [];
            scene.db.actions.pickRayEach({
                ray: { a: [1.4, 5, 0], b: [1.4, 2.5, 0] },
                radius: 0.5,
                visit: (h) => { seen.push(h.entity); },
            });
            expect(seen.length).toBeGreaterThanOrEqual(1);
            expect(seen[0]).toBe(scene.ball);
        });

        it("castRayEach reuses a single hit instance across visits (zero-alloc contract)", () => {
            const refs: PhysicsHit[] = [];
            scene.db.actions.pickRayEach({ ray: { a: [0, 10, 0], b: [0, -10, 0] }, visit: (h) => { refs.push(h); } });
            expect(refs.length).toBe(2);
            expect(refs[0]).toBe(refs[1]); // same object, refilled per visit — do not retain
        });

        it("castRay returns fresh, independent hits (safe to retain)", () => {
            const h1 = scene.db.actions.pickRay({ ray: { a: [0, 10, 0], b: [0, -10, 0] } });
            const h2 = scene.db.actions.pickRay({ ray: { a: [5, 10, 0], b: [5, -10, 0] } });
            expect(h1).not.toBe(h2);
            expect(h1!.entity).toBe(scene.ball); // unaffected by the second pick
            expect(h2!.entity).toBe(scene.box);
        });
    });
}

describePicking("rapierSolver", rapierSolver);
describePicking("joltSolver", joltSolver);
