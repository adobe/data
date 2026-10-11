import { it } from "vitest";
import { createWorld } from "../world/create/create.js";
import { fastest as particlesFastest, move, spawn } from "./particles.js";
import { chain, fastest, follow, observe, poke, report, seeded } from "./suite.js";

const workerCounts = [0, undefined] as const;
const label = (workers: number | undefined): string => workers === 0 ? "main" : "workers";

it("move 1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = createWorld({ workers });
        await world.systems.register(spawn, move);
        await world.run(spawn, 1_000_000);
        report(`move 1M ${label(workers)}`, (await particlesFastest(() => world.run(move))).minimum);
        await world.dispose();
    }
}, 120_000);

it("follow 100K across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 100_000, follow);
        report(`follow 100K ${label(workers)}`, await fastest(() => world.run(follow)));
        await world.dispose();
    }
}, 120_000);

it("chain 6x100K across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 100_000, chain);
        report(`chain 6x100K ${label(workers)}`, await fastest(() => world.run(chain)));
        await world.dispose();
    }
}, 120_000);

it("sparse changed 1M across workers", async () => {
    for (const workers of workerCounts) {
        const world = await seeded(() => createWorld({ workers }), 1_000_000, poke, observe);
        let frame = 0;
        let best = Infinity;
        for (let i = 0; i < 60; i++) {
            await world.run(poke, frame++ % 100);
            const start = performance.now();
            await world.run(observe);
            if (i >= 10) best = Math.min(best, performance.now() - start);
        }
        report(`sparse changed 1M ${label(workers)}`, best);
        await world.dispose();
    }
}, 120_000);
