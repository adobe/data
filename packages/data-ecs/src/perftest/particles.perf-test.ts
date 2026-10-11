import { expect, it } from "vitest";
import { World } from "../world/world.js";
import { enabled, fastest, move, position, spawn, visible } from "./particles.js";

it("create 100K", async () => {
    const { minimum, passes } = await fastest(async () => {
        const world = await World.create({ systems: [spawn] });
        await world.run(spawn, 100_000);
    }, 3000);
    console.log(`data-ecs create 100K: ${minimum.toFixed(2)} ms (${passes} passes)`);
}, 60_000);

it("move 1M (250K visible and enabled)", async () => {
    const world = await World.create({ systems: [spawn, move] });
    await world.run(spawn, 1_000_000);
    expect(world.query.count([position, visible, enabled])).toBe(250_000);
    const { minimum, passes } = await fastest(() => world.run(move));
    console.log(`data-ecs move 1M: ${minimum.toFixed(3)} ms per run (${passes} passes)`);
}, 60_000);
