import { expect, it } from "vitest";
import { createWorld } from "../world/create/create.js";
import { enabled, fastest, move, position, spawn, visible } from "./particles.js";

it("move 1M (250K visible and enabled) across workers", async () => {
    for (const workers of [0, undefined]) {
        const world = createWorld({ workers });
        await world.systems.register(spawn, move);
        await world.run(spawn, 1_000_000);
        expect(world.query.count([position, visible, enabled])).toBe(250_000);
        const { minimum, passes } = await fastest(() => world.run(move));
        console.log(`data-ecs move 1M, ${workers ?? `${navigator.hardwareConcurrency - 1} (default)`} workers: ${minimum.toFixed(3)} ms per run (${passes} passes)`);
        await world.dispose();
    }
});
