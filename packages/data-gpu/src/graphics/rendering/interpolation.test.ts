// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { interpolation } from "./interpolation-plugin.js";

/**
 * The interpolation pass turns the fixed-step sim state into a smooth render pose.
 * No solver here — we hand-seed the prev snapshot a solver would write, then assert
 * the display pose is the alpha-blend of prev → current. Pure + deterministic
 * (no WASM, no GPU), so it runs headless.
 */
describe("interpolation", () => {
    const seedBody = (db: ReturnType<typeof Database.create<typeof interpolation>>) => {
        // a body the solver has already mirrored (so it carries a prev snapshot)
        const id = db.store.archetypes.RigidBody.insert({
            bodyType: "dynamic", colliderShape: "box", halfExtents: [0.5, 0.5, 0.5], material: 0,
            position: [0, 10, 0], rotation: [0, 0, 0, 1], linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0],
        });
        db.store.update(id, { _prevPosition: [0, 10, 0], _prevRotation: [0, 0, 0, 1] });
        return id;
    };
    const renderPos = (db: ReturnType<typeof Database.create<typeof interpolation>>, id: number): readonly number[] =>
        // read returns the full component record; the system has added _renderPosition
        (db.store.read(id) as { _renderPosition: readonly number[] })._renderPosition;

    it("blends prev → current by the clock's alpha into the display pose", () => {
        const db = Database.create(interpolation);
        const id = seedBody(db);
        db.store.update(id, { position: [0, 6, 0] }); // a step landed: prev y=10, current y=6
        db.store.resources.physicsClock = { ...db.store.resources.physicsClock, alpha: 0.25, steps: 0 };

        db.system.functions.interpolateDisplayPose?.();

        expect(renderPos(db, id)[1]).toBeCloseTo(9); // 10 + (6 - 10) * 0.25
    });

    it("at alpha→0 the display pose equals prev; at alpha→1 it equals current", () => {
        const db = Database.create(interpolation);
        const id = seedBody(db);
        db.store.update(id, { position: [0, 6, 0] });

        db.store.resources.physicsClock = { ...db.store.resources.physicsClock, alpha: 0, steps: 0 };
        db.system.functions.interpolateDisplayPose?.();
        expect(renderPos(db, id)[1]).toBeCloseTo(10); // prev

        db.store.resources.physicsClock = { ...db.store.resources.physicsClock, alpha: 1, steps: 0 };
        db.system.functions.interpolateDisplayPose?.();
        expect(renderPos(db, id)[1]).toBeCloseTo(6); // current
    });
});
