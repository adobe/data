// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System, World, workers } from "../../index.js";
import { count, frame } from "./particles.js";

/** The same simulation in plain f64 JS. */
const reference = (frames: readonly number[]): number[][] => {
    const particles = Array.from({ length: 100 }, (_, i) => ({ position: [0, 0, 0], velocity: [1, i, 0] }));
    for (const seconds of frames.slice(1)) {
        for (const particle of particles) {
            particle.velocity[1] -= 9.8 * seconds;
            particle.position = particle.position.map((value, axis) => value + particle.velocity[axis] * seconds);
        }
    }
    return particles.map(particle => particle.position);
};

describe("particles", () => {
    it("matches a plain JS simulation within storage precision", async () => {
        // Kernels run here: under Vitest's module runner, node workers can't load the sources.
        await using world = World.create({ [workers]: 0 });
        const frames = [0.5, 0.25, 1 / 60, 1 / 60];
        let positions: readonly (readonly number[])[] = [];
        for (const seconds of frames) positions = await frame(world, seconds);
        let spawned = 0;
        await world.run(System.create({ observer: true, resources: { read: [count] } }, ({ resources }) => { spawned = resources[count]; }));
        expect(spawned).toBe(100);
        const expected = reference(frames);
        expect(positions).toHaveLength(expected.length);
        positions.forEach((position, i) => position.forEach((value, axis) => expect(value).toBeCloseTo(expected[i][axis], 3)));
    });
});
