// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { physicsClock } from "./physics-clock-plugin.js";

/** The accumulator turns a variable render dt into a whole number of fixed steps
 *  plus a leftover interpolation `alpha`, capped against the spiral of death. */
describe("physicsClock", () => {
    const make = () => Database.create(physicsClock); // 60 Hz default
    const advance = (db: ReturnType<typeof make>, dt: number) => {
        db.store.resources.frameTime = { now: 0, dt, elapsed: 0 };
        db.system.functions.advancePhysicsClock?.();
        return db.store.resources.physicsClock;
    };

    it("matched render rate → exactly one step per frame, alpha ≈ 0", () => {
        const db = make();
        const c = advance(db, 1 / 60);
        expect(c.steps).toBe(1);
        expect(c.alpha).toBeCloseTo(0);
    });

    it("render slower than sim → multiple steps per frame", () => {
        const db = make();
        expect(advance(db, 1 / 30).steps).toBe(2); // two 1/60 steps fit one 1/30 frame
    });

    it("render faster than sim → 0-step frames that accumulate, alpha rising then resetting", () => {
        const db = make();
        const a = advance(db, 1 / 120); // half a step accrued
        expect(a.steps).toBe(0);
        expect(a.alpha).toBeCloseTo(0.5);
        const b = advance(db, 1 / 120); // now a full step is due
        expect(b.steps).toBe(1);
        expect(b.alpha).toBeCloseTo(0);
    });

    it("a long stall is capped at maxSubSteps (no spiral of death)", () => {
        const db = make();
        const c = advance(db, 10); // 600 steps' worth of time
        expect(c.steps).toBe(c.maxSubSteps);
    });

    it("setFixedTimestep changes the rate", () => {
        const db = make();
        db.transactions.setFixedTimestep(30);
        expect(advance(db, 1 / 30).steps).toBe(1); // one 1/30 step per 1/30 frame
    });
});
