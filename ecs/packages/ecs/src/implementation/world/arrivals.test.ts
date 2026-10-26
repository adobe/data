// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { arrivalsPosition, arrivalsWord, createArrivals, createDebts, logArrival, viewInMemory, viewOfArrivals } from "./arrivals.js";
import { createMemory } from "./memory.js";

/** A ring and the debts of a system matching archetypes 0 and 1, at points 5 and 10, its last run 10. */
const setup = (shared = false) => {
    const memory = createMemory(shared);
    const ring = createArrivals(memory);
    const points = [5, 10];
    const matchOf = [0, 1, -1];
    const debts = createDebts(points, matchOf, 0);
    const view = viewOfArrivals(ring);
    const read = (through: number, oldest = () => 5) => debts.read(view, through, 3, 10, oldest);
    return { memory, ring, points, debts, view, read };
};

describe("arrivals", () => {
    it("owes an archetype rows moved in the point of the archetype they came from, settled as it runs", () => {
        const { ring, debts, read } = setup();
        logArrival(ring, 0, 1, 11);
        read(12);
        expect(debts.sinceOf(1, 10)).toBe(5);
        expect(debts.sinceOf(0, 5)).toBe(5);
        debts.settle(1);
        expect(debts.sinceOf(1, 10)).toBe(10);
    });

    it("carries a debt along moves in order, and a non-match's point is the last run", () => {
        const { ring, debts, read } = setup();
        // Into 2, which it doesn't match, from 0; then on to 1: rows from 0 came along.
        logArrival(ring, 0, 2, 11);
        logArrival(ring, 2, 1, 12);
        read(13);
        expect(debts.sinceOf(1, 10)).toBe(5);
        const later = setup();
        // In the other order, the rows reaching 1 came from 2 alone, whose rows the system never saw since its last run.
        logArrival(later.ring, 2, 1, 11);
        logArrival(later.ring, 0, 2, 12);
        later.read(13);
        expect(later.debts.sinceOf(1, 10)).toBe(10);
        expect(later.debts.sinceOf(2, 10)).toBe(5);
    });

    it("reads only the syncs through the run's tick, the rest at the next", () => {
        const { ring, debts, read } = setup();
        logArrival(ring, 0, 1, 20);
        read(19);
        expect(debts.sinceOf(1, 10)).toBe(10);
        read(20);
        expect(debts.sinceOf(1, 10)).toBe(5);
    });

    it("keeps ticks past 2^32 whole", () => {
        const { ring, debts, read } = setup();
        logArrival(ring, 0, 1, 2 ** 32 + 3);
        read(2 ** 32 + 2);
        expect(debts.sinceOf(1, 10)).toBe(10);
        read(2 ** 32 + 3);
        expect(debts.sinceOf(1, 10)).toBe(5);
    });

    it("owes every archetype the oldest point once the ring overwrote unread entries, at that read and the next", () => {
        const { ring, debts, view, read } = setup();
        for (let k = 0; k <= 4096; k++) logArrival(ring, 1, 0, 11);
        read(12, () => 3);
        expect(debts.sinceOf(0, 5)).toBe(3);
        expect(debts.sinceOf(1, 10)).toBe(3);
        expect(debts.sinceOf(2, 10)).toBe(3);
        debts.settle(1);
        // Read from the ring's position on, owing the same floor again.
        read(12, () => 9);
        expect(debts.sinceOf(1, 10)).toBe(3);
        debts.settle(1);
        read(12, () => 9);
        expect(debts.sinceOf(1, 10)).toBe(10);
        expect(arrivalsPosition(view)).toBe(4097);
    });

    it("is found by a joined thread through the directory header in shared memory", () => {
        const { memory, ring, debts } = setup(true);
        logArrival(ring, 0, 1, 11);
        const words = new Uint32Array(memory.memory.buffer);
        const view = viewInMemory(words, words[arrivalsWord]);
        expect(arrivalsPosition(view)).toBe(1);
        debts.read(view, 11, 3, 10, () => 5);
        expect(debts.sinceOf(1, 10)).toBe(5);
    });
});
