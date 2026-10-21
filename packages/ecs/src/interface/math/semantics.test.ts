import { describe, expect, test } from "vitest";
import { U32, Vec2, Vec3, Vec4 } from "./index.js";

/** The bit-at-a-time definitions the loop-free versions must agree with. */
const reference = {
    countOneBits: (n: number): number => [...(n >>> 0).toString(2)].filter(bit => bit === "1").length,
    countTrailingZeros: (n: number): number => (n >>> 0) === 0 ? 32 : (n >>> 0).toString(2).length - 1 - (n >>> 0).toString(2).lastIndexOf("1"),
    reverseBits: (n: number): number => parseInt([...(n >>> 0).toString(2).padStart(32, "0")].reverse().join(""), 2),
};

describe("math follows WGSL", () => {
    test("bit counts and reversal agree with their bitwise definitions", () => {
        let seed = 12345;
        const values = [0, 1, 2, 3, 0x80000000, 0xFFFFFFFF, 0x7FFFFFFF, 0x55555555, -1, -(2 ** 31)];
        for (let i = 0; i < 1000; i++) values.push(seed = (Math.imul(seed, 1103515245) + 12345) >>> 0);
        for (const value of values) {
            expect(U32.countOneBits(value)).toBe(reference.countOneBits(value));
            expect(U32.countTrailingZeros(value)).toBe(reference.countTrailingZeros(value));
            expect(U32.reverseBits(value)).toBe(reference.reverseBits(value));
        }
        expect(Vec3.I32.reverseBits([1, 0, 0])).toEqual([-(2 ** 31), 0, 0]);
    });

    test("round sends halfway values to the even integer", () => {
        expect(Vec4.round([0.5, 1.5, 2.5, -2.5])).toEqual([0, 2, 2, -2]);
        expect(Vec3.round([-0.5, 0.49999999999999994, 2.6])).toEqual([-0, 0, 3]);
        expect(Vec2.round([1e300, -1.5])).toEqual([1e300, -2]);
    });

    test("mod is x - m * floor(x / m)", () => {
        expect(Vec3.mod([5.5, -1, -7], 3)).toEqual([2.5, 2, 2]);
        expect(Vec2.mod([1, -1], -3)).toEqual([-2, -1]);
    });

    test("integer vectors wrap", () => {
        expect(Vec3.I32.add([2 ** 31 - 1, -(2 ** 31), 0], [1, -1, 0])).toEqual([-(2 ** 31), 2 ** 31 - 1, 0]);
        expect(Vec3.I32.subtract([-(2 ** 31), 0, 0], [1, 0, 0])).toEqual([2 ** 31 - 1, 0, 0]);
        expect(Vec3.I32.multiply([65536, 3, 0], [65536, -4, 0])).toEqual([0, -12, 0]);
        expect(Vec3.I32.negate([-(2 ** 31), 1, 0])).toEqual([-(2 ** 31), -1, 0]);
        expect(Vec3.I32.abs([-(2 ** 31), -5, 0])).toEqual([-(2 ** 31), 5, 0]);
        // Products above 2 ** 53 keep their low bits.
        expect(Vec3.U32.multiply([0xFFFFFFFF, 0x10001, 0], [0xFFFFFFFF, 0x10001, 0])).toEqual([1, 0x20001, 0]);
        expect(Vec3.U32.volume([0xFFFFFFFF, 0xFFFFFFFF, 3])).toBe(3);
    });

    test("normalize is scale by the inverse length", () => {
        expect(Vec3.normalize([0, 0, 2])).toEqual([0, 0, 1]);
        expect(Vec3.normalize([0, 0, 0]).every(Number.isNaN)).toBe(true);
    });
});
