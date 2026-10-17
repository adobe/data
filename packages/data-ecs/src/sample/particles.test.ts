import { describe, expect, it } from "vitest";
import { readResource } from "../world/reads.test-helper.js";
import { count, frame, start } from "./particles.js";

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
        const world = await start();
        const frames = [0.5, 0.25, 1 / 60, 1 / 60];
        let positions: readonly (readonly number[])[] = [];
        for (const seconds of frames) positions = await frame(world, seconds);
        expect(await readResource(world, count)).toBe(100);
        const expected = reference(frames);
        expect(positions).toHaveLength(expected.length);
        positions.forEach((position, i) => position.forEach((value, axis) => expect(value).toBeCloseTo(expected[i][axis], 3)));
        await world.dispose();
    });
});
