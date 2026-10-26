// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type * as Fixture from "./dispatch.fixture.js";

/** Tasks reach workers in order, through rings and messages: the cases, over the fixture built for node or from source. */
export const dispatchCases = (load: () => Promise<typeof Fixture>) => describe("worker dispatch", () => {
    it("reloads kernels on workers when an observer registers", async () => {
        const fixture = await load();
        expect(await fixture.reloadedOnObserver()).toBe(4096);
    }, 200000);
    for (const failing of [1, 2]) it(`keeps worker kernels in step after a failed registration (compile ${failing})`, async () => {
        const fixture = await load();
        const { rejected, rows } = await fixture.afterFailedRegistration(failing);
        expect(rejected).toContain("injected");
        expect(rows).toBe(4096);
    }, 200000);
    it("delivers layouts between back-to-back runs", async () => {
        const fixture = await load();
        expect(await fixture.backToBack()).toEqual([0, 0, 0, 0, 0, 0]);
    }, 200000);
    for (const name of ["fastA,slowB", "fastA,fastC", "slowB,fastC"] as const) it(`runs tiers of ${name}`, async () => {
        const fixture = await load();
        expect(await fixture.tier(name)).toBe("ok");
    }, 200000);
    it("fast, message, fast kernels in one tier don't hang", async () => {
        const fixture = await load();
        expect(await fixture.tier("fastA,slowB,fastC")).toBe("ok");
    }, 200000);
    it("ring overflow followed by a message task in the same tier doesn't hang", async () => {
        const fixture = await load();
        expect(await fixture.overflowThenMessage()).toBe("ok");
    }, 200000);
});
