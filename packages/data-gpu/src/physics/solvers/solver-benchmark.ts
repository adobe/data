// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";

/**
 * Headless benchmark harness for a physics **solver plugin** (anything built on
 * the `physicsData` seam — `rapierSolver`, `joltSolver`, …). It builds a fixed,
 * deterministic scene (a floor + a grid of bodies dropped to pile up), then
 * advances the simulation at a fixed timestep as fast as the CPU allows and
 * reports the wall-clock cost per frame. No rendering, no rAF, no GPU — so the
 * numbers reflect solver compute only and are directly comparable across plugins.
 *
 * Async because some solvers (Rapier) initialise WASM lazily; the warm-up phase
 * yields to the event loop so that init + scene settling complete before timing.
 */

export interface SolverBenchmarkOptions {
    /** Dynamic bodies dropped into the scene (≈ workload size). Default 256. */
    bodies?: number;
    /** Timed frames. Default 300. */
    frames?: number;
    /** Warm-up frames before timing (lets async init finish + the pile settle). Default 90. */
    warmupFrames?: number;
    /** Fixed timestep per frame (seconds). Default 1/60. */
    dt?: number;
    /** Fraction of `bodies` that are spheres (rest are boxes). Default 0.5. */
    sphereFraction?: number;
    /** Extra *static* collider boxes laid out as resting scenery. They barely
     *  cost the engine (nothing moves) but they ARE mirrored once and then scanned
     *  by a naive per-frame sync — so this isolates the gather/sync overhead, which
     *  is the realistic "many static, few dynamic" target workload. Default 0. */
    staticBodies?: number;
}

export interface SolverBenchmarkResult {
    bodies: number;
    frames: number;
    /** Total wall-clock time of the timed frames (ms). */
    totalMs: number;
    /** Mean cost of one frame (ms) — the headline number. */
    msPerFrame: number;
    /** Simulation frames per real second (1000 / msPerFrame). */
    simFps: number;
    /** Slowest single frame (ms) — surfaces hitches. */
    maxFrameMs: number;
    // --- coarse end-state, for cross-solver parity / sanity (not perf) ---
    avgY: number;      // mean height of dynamic bodies (piled ≈ low, exploded ≈ wild)
    maxSpeed: number;  // fastest dynamic body (a stable pile is near 0)
    belowFloor: number; // dynamic bodies that sank below the floor top (should be 0)
}

interface LooseStore {
    archetypes: Record<string, { insert(v: unknown): number }>;
    queryArchetypes(include: readonly string[], opts?: { exclude?: readonly string[] }): Iterable<{
        rowCount: number;
        columns: Record<string, { getTypedArray(): { [i: number]: number } }>;
    }>;
    resources: Record<string, unknown>;
}
interface LooseDb { store: LooseStore; system: { functions: Record<string, () => unknown>; order?: string[][] }; }

const yieldToEventLoop = () => new Promise<void>(r => setTimeout(r, 0));

export async function runSolverBenchmark(solver: Database.Plugin, opts: SolverBenchmarkOptions = {}): Promise<SolverBenchmarkResult> {
    const bodies = opts.bodies ?? 256;
    const frames = opts.frames ?? 300;
    const warmupFrames = opts.warmupFrames ?? 90;
    const dt = opts.dt ?? 1 / 60;
    const sphereFraction = opts.sphereFraction ?? 0.5;
    const staticBodies = opts.staticBodies ?? 0;

    // The solver plugin extends `physicsData`, so the RigidBody / StaticCollider
    // archetypes and the `frameTime` resource exist on the created database. The
    // benchmark drives the sim dynamically, so the store is used through a loose
    // shape (runtime invariant: these members exist on any physicsData solver).
    const db = Database.create(solver) as unknown as LooseDb;

    buildScene(db, bodies, sphereFraction, staticBodies);

    // Drive one frame: set a fixed dt, then run every system except the rAF/clock
    // ones (we supply dt ourselves so timing is deterministic and high-rate).
    const order = db.system.order;
    const names = order ? order.flat() : Object.keys(db.system.functions);
    const runNames = names.filter(n => n !== "_frameTime" && n !== "schedulerSystem");
    const tick = (f: number): void => {
        db.store.resources.frameTime = { now: f * dt * 1000, dt, elapsed: f * dt };
        for (const n of runNames) { const fn = db.system.functions[n]; if (fn) fn(); }
    };

    // Warm-up: yield to the event loop so lazy WASM init (Rapier) completes and
    // the pile settles into a steady-state contact count before we measure.
    for (let f = 0; f < warmupFrames; f++) { tick(f); await yieldToEventLoop(); }

    // Timed run: tight synchronous loop — pure solver compute.
    let maxFrameMs = 0;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
        const a = performance.now();
        tick(warmupFrames + f);
        const ms = performance.now() - a;
        if (ms > maxFrameMs) maxFrameMs = ms;
    }
    const totalMs = performance.now() - t0;

    const { avgY, maxSpeed, belowFloor } = sampleState(db);
    return {
        bodies, frames,
        totalMs, msPerFrame: totalMs / frames, simFps: 1000 / (totalMs / frames), maxFrameMs,
        avgY, maxSpeed, belowFloor,
    };
}

/** A thick static floor + `bodies` dynamic bodies in a compact cube grid that
 *  drops a short distance and piles up — a steady-state contact workload. The
 *  floor is deliberately thick (a finite box has a far side) and the drop is
 *  short, so a correct solver never tunnels: end-state avgY/maxV then cleanly
 *  separate a stable solver from an exploding one. Optional `staticBodies` adds
 *  resting static scenery to exercise the sync/gather path at scale. */
function buildScene(db: LooseDb, bodies: number, sphereFraction: number, staticBodies: number): void {
    db.store.archetypes.StaticCollider.insert({
        colliderShape: "box", halfExtents: [12, 2, 12], material: 0,
        position: [0, -2, 0], rotation: [0, 0, 0, 1], // top face at y = 0
    });
    // resting static scenery far from the action (negligible engine cost, but it
    // is mirrored once and then scanned every frame by a naive per-frame sync)
    if (staticBodies > 0) {
        const side = Math.ceil(Math.cbrt(staticBodies));
        let n = 0;
        for (let x = 0; x < side && n < staticBodies; x++)
            for (let y = 0; y < side && n < staticBodies; y++)
                for (let z = 0; z < side && n < staticBodies; z++, n++)
                    db.store.archetypes.StaticCollider.insert({
                        colliderShape: "box", halfExtents: [0.4, 0.4, 0.4], material: 0,
                        position: [100 + x, y, z], rotation: [0, 0, 0, 1],
                    });
    }
    const side = Math.ceil(Math.cbrt(bodies));
    const gap = 1.5, base = -((side - 1) / 2) * gap; // spaced so the initial drop is non-overlapping
    let n = 0;
    for (let y = 0; y < side && n < bodies; y++) {
        for (let x = 0; x < side && n < bodies; x++) {
            for (let z = 0; z < side && n < bodies; z++, n++) {
                const sphere = ((n * 0x9e3779b1) >>> 0) / 4294967296 < sphereFraction;
                db.store.archetypes.RigidBody.insert({
                    bodyType: "dynamic",
                    colliderShape: sphere ? "sphere" : "box",
                    halfExtents: sphere ? [0.45, 0, 0] : [0.45, 0.45, 0.45],
                    material: 0,
                    position: [base + x * gap, 0.6 + y * gap, base + z * gap],
                    rotation: [0, 0, 0, 1],
                    linearVelocity: [0, 0, 0],
                    angularVelocity: [0, 0, 0],
                });
            }
        }
    }
}

function sampleState(db: LooseDb): { avgY: number; maxSpeed: number; belowFloor: number } {
    let count = 0, sumY = 0, maxSpeed = 0, belowFloor = 0;
    for (const arch of db.store.queryArchetypes(["linearVelocity", "position"])) {
        const pos = arch.columns.position.getTypedArray(), lv = arch.columns.linearVelocity.getTypedArray();
        for (let r = 0; r < arch.rowCount; r++, count++) {
            const r3 = r * 3, y = pos[r3 + 1];
            sumY += y;
            if (y < -0.5) belowFloor++; // floor top is y = 0; a resting body sits above it
            const sp = Math.hypot(lv[r3], lv[r3 + 1], lv[r3 + 2]);
            if (sp > maxSpeed) maxSpeed = sp;
        }
    }
    return { avgY: count ? sumY / count : 0, maxSpeed, belowFloor };
}
