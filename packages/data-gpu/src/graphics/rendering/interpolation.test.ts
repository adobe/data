// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { interpolation } from "./interpolation-plugin.js";
import type { PhysicsClock } from "../../physics/physics-clock/physics-clock.js";

/**
 * The interpolation pass turns the fixed-step sim state into a smooth render pose.
 * No solver here — we hand-seed the prev snapshot a solver would write, then assert
 * the display pose is the alpha-blend of prev → current. Pure + deterministic
 * (no WASM, no GPU), so it runs headless.
 */
describe("interpolation", () => {
    // A created database carries a writable `store` (runtime invariant; not on the
    // public type — the same loose access the solver benchmark uses).
    interface InterpStore {
        resources: { physicsClock: PhysicsClock };
        archetypes: { RigidBody: { insert(v: object): number } };
        read(id: number): { _renderPosition: readonly number[] };
        update(id: number, v: object): void;
    }

    const make = () => {
        const db = Database.create(interpolation);
        const store = (db as unknown as { store: InterpStore }).store;
        // a body the solver has already mirrored (so it carries a prev snapshot)
        const id = store.archetypes.RigidBody.insert({
            bodyType: "dynamic", colliderShape: "box", halfExtents: [0.5, 0.5, 0.5], material: 0,
            position: [0, 10, 0], rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
        });
        store.update(id, { _prevPosition: [0, 10, 0], _prevRotation: [0, 0, 0, 1] });
        store.update(id, { position: [0, 6, 0] }); // a step landed: prev y=10, current y=6

        const interpolateAt = (alpha: number): number => {
            store.resources.physicsClock = { ...store.resources.physicsClock, alpha, steps: 0 };
            db.system.functions.interpolateDisplayPose?.();
            return store.read(id)._renderPosition[1];
        };
        return { interpolateAt };
    };

    it("blends prev → current by the clock's alpha into the display pose", () => {
        expect(make().interpolateAt(0.25)).toBeCloseTo(9); // 10 + (6 - 10) * 0.25
    });

    it("at alpha→0 the display pose equals prev; at alpha→1 it equals current", () => {
        const { interpolateAt } = make();
        expect(interpolateAt(0)).toBeCloseTo(10); // prev
        expect(interpolateAt(1)).toBeCloseTo(6);  // current
    });
});
