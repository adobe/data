import { expect, it } from "vitest";
import { World } from "../world/world.js";
import { enabled, fastest as particlesFastest, move, position as particlePosition, spawn, visible } from "./particles.js";
import { chain as chainSuite, churn as churnSuite, emit as emitSuite, fastest, follow, hits, index, observe, poke, position, report, retag, seeded, smalls, tag, totalOf } from "./suite.js";

it("create 100K", async () => {
    report("create 100K", await fastest(async () => {
        const world = await World.create({ systems: [spawn] });
        await world.run(spawn, 100_000);
        await world.dispose();
    }, 3000, 2));
}, 120_000);

it("move 1M (250K visible and enabled)", async () => {
    const world = await World.create({ systems: [spawn, move] });
    await world.run(spawn, 1_000_000);
    expect(world.query.count([particlePosition, visible, enabled])).toBe(250_000);
    report("move 1M", (await particlesFastest(() => world.run(move))).minimum);
    await world.dispose();
}, 120_000);

it("churn: despawn and respawn 10% of 100K", async () => {
    const world = await seeded(() => World.create(), 100_000, churnSuite);
    let frame = 0;
    report("churn 100K", await fastest(() => world.run(churnSuite, frame++ % 10)));
    expect(world.query.count([index])).toBe(100_000);
    await world.dispose();
}, 120_000);

it("retag: move 20% of 100K between archetypes", async () => {
    const world = await seeded(() => World.create(), 100_000, retag);
    let frame = 0;
    report("retag 100K", await fastest(() => world.run(retag, frame++ % 10)));
    expect(world.query.count([tag])).toBeGreaterThan(0);
    await world.dispose();
}, 120_000);

it("sparse changed: observe 1% of 1M", async () => {
    const world = await seeded(() => World.create(), 1_000_000, poke, observe);
    let frame = 0;
    let best = Infinity;
    for (let i = 0; i < 60; i++) {
        await world.run(poke, frame++ % 100);
        const start = performance.now();
        await world.run(observe);
        if (i >= 10) best = Math.min(best, performance.now() - start);
    }
    report("sparse changed 1M", best);
    await world.dispose();
}, 120_000);

it("follow: a lookup per row, 100K", async () => {
    const world = await seeded(() => World.create(), 100_000, follow);
    report("follow 100K", await fastest(() => world.run(follow)));
    await world.dispose();
}, 120_000);

it("emit: commands from a kernel, 10% of 100K", async () => {
    const world = await seeded(() => World.create(), 100_000, emitSuite);
    report("emit 100K", await fastest(() => world.run(emitSuite)));
    expect(world.query.count([hits])).toBe(10_000);
    await world.dispose();
}, 120_000);

it("chain: six dependent kernels over 100K", async () => {
    const world = await seeded(() => World.create(), 100_000, chainSuite);
    report("chain 6x100K", await fastest(() => world.run(chainSuite)));
    await world.dispose();
}, 120_000);

it("main thread: 50 small systems over 1K", async () => {
    const world = await seeded(() => World.create(), 1_000, smalls);
    report("main thread 50x1K", await fastest(() => world.run(smalls)));
    expect(totalOf()).toBeGreaterThan(0);
    await world.dispose();
}, 120_000);

it("select: where and reads over 100K", async () => {
    const world = await seeded(() => World.create(), 100_000);
    report("select 100K", await fastest(async () => {
        const selected = world.query.select([position, index], { where: { [index]: { "<": 50_000 } } });
        let sum = 0;
        for (const entity of selected) sum += world.read.component(entity, position)?.[0] ?? 0;
        expect(sum).toBeGreaterThan(0);
    }));
    await world.dispose();
}, 120_000);
