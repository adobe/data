// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { coveringBuffer, createMemory, pageBytes } from "./memory.js";

/**
 * A memory whose buffer stays short until it grows, by nothing too, as a thread's does when its memory object arrived
 * in a message while another thread grew the memory.
 */
const missedGrowth = (short: number, long: number) => {
    let grows = 0;
    const shortBuffer = new SharedArrayBuffer(short);
    const longBuffer = new SharedArrayBuffer(long);
    return {
        get buffer(): SharedArrayBuffer {
            return grows === 0 ? shortBuffer : longBuffer;
        },
        grow: (delta: number): number => {
            grows++;
            return long / pageBytes + delta;
        },
        grows: () => grows,
    };
};

describe("coveringBuffer", () => {
    it("refreshes a buffer shorter than the length the world stored, by growing the memory by nothing", () => {
        const memory = missedGrowth(4, 8);
        expect(coveringBuffer(memory, 8).byteLength).toBe(8);
        expect(memory.grows()).toBe(1);
    });
    it("leaves a buffer that covers the length as it is", () => {
        const memory = missedGrowth(8, 16);
        expect(coveringBuffer(memory, 8).byteLength).toBe(8);
        expect(memory.grows()).toBe(0);
    });
    it("never grows unshared memory, which would detach its views", () => {
        const memory = createMemory(false);
        const buffer = memory.memory.buffer;
        expect(coveringBuffer(memory.memory, 2 * pageBytes)).toBe(buffer);
        expect(buffer.byteLength).toBe(pageBytes);
    });
});
