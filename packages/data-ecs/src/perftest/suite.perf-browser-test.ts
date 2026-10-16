import { it } from "vitest";
import { createWorld } from "../world/create/create.js";
import { fastest as particlesFastest, move, spawn } from "./particles.js";
import { chain, fastest, follow, observe, poke, report, seeded } from "./suite.js";

const workerCounts = [0, undefined] as const;
const label = (workers: number | undefined): string => workers === 0 ? "main" : "workers";

/**
 * Runs once per animation frame, as an app does, and reports the median and 90th percentile, since the fastest of
 * back-to-back runs hides the idle time between frames.
 */
const framed = async (name: string, run: () => Promise<void>, frames = 240): Promise<void> => {
    const frame = (): Promise<number> => new Promise(resolve => requestAnimationFrame(resolve));
    for (let i = 0; i < 20; i++) await run();
    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
        await frame();
        const start = performance.now();
        await run();
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    report(`${name} framed p50`, times[Math.floor(times.length * 0.5)]);
    report(`${name} framed p90`, times[Math.floor(times.length * 0.9)]);
};

it("move 1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = createWorld({ workers });
        await world.run(spawn, { count: 1_000_000 });
        report(`move 1M ${label(workers)}`, (await particlesFastest(() => world.run(move))).minimum);
        await framed(`move 1M ${label(workers)}`, () => world.run(move));
        await world.dispose();
    }
}, 120_000);

it("follow 1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 1_000_000);
        report(`follow 1M ${label(workers)}`, await fastest(() => world.run(follow)));
        await framed(`follow 1M ${label(workers)}`, () => world.run(follow));
        await world.dispose();
    }
}, 120_000);

it("chain 6x1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 1_000_000);
        report(`chain 6x1M ${label(workers)}`, await fastest(() => world.run(chain)));
        await framed(`chain 6x1M ${label(workers)}`, () => world.run(chain));
        await world.dispose();
    }
}, 120_000);

it("sparse changed 1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 1_000_000);
        let frame = 0;
        let best = Infinity;
        for (let i = 0; i < 60; i++) {
            await world.run(poke, { group: frame++ % 100 });
            const start = performance.now();
            await world.run(observe);
            if (i >= 10) best = Math.min(best, performance.now() - start);
        }
        report(`sparse changed 1M ${label(workers)}`, best);
        await world.dispose();
    }
}, 120_000);
