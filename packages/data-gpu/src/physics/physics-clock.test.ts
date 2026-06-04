// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { physicsClock, type PhysicsClock } from "./physics-clock-plugin.js";

/** The accumulator turns a variable render dt into a whole number of fixed steps
 *  plus a leftover interpolation `alpha`, capped against the spiral of death. */
describe("physicsClock", () => {
    // A created database carries a writable `store` (runtime invariant; not on the
    // public type — same loose access the solver benchmark uses to drive frames).
    interface ClockStore { resources: { physicsClock: PhysicsClock; frameTime: { now: number; dt: number; elapsed: number } } }

    const make = () => {
        const db = Database.create(physicsClock); // 60 Hz default
        const store = (db as unknown as { store: ClockStore }).store;
        const advance = (dt: number): PhysicsClock => {
            store.resources.frameTime = { now: 0, dt, elapsed: 0 };
            db.system.functions.advancePhysicsClock?.();
            return store.resources.physicsClock;
        };
        return { db, advance };
    };

    it("matched render rate → exactly one step per frame, alpha ≈ 0", () => {
        const c = make().advance(1 / 60);
        expect(c.steps).toBe(1);
        expect(c.alpha).toBeCloseTo(0);
    });

    it("render slower than sim → multiple steps per frame", () => {
        expect(make().advance(1 / 30).steps).toBe(2); // two 1/60 steps fit one 1/30 frame
    });

    it("render faster than sim → 0-step frames that accumulate, alpha rising then resetting", () => {
        const { advance } = make();
        const a = advance(1 / 120); // half a step accrued
        expect(a.steps).toBe(0);
        expect(a.alpha).toBeCloseTo(0.5);
        const b = advance(1 / 120); // now a full step is due
        expect(b.steps).toBe(1);
        expect(b.alpha).toBeCloseTo(0);
    });

    it("a long stall is capped at maxSubSteps (no spiral of death)", () => {
        const c = make().advance(10); // 600 steps' worth of time
        expect(c.steps).toBe(c.maxSubSteps);
    });

    it("setFixedTimestep changes the rate", () => {
        const { db, advance } = make();
        db.transactions.setFixedTimestep(30);
        expect(advance(1 / 30).steps).toBe(1); // one 1/30 step per 1/30 frame
    });
});
