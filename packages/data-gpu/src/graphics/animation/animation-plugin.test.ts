// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database, type Store } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { animation } from "./animation-plugin.js";
import type { AnimationTrack } from "./animation-track/animation-track.js";

function scalarTrack(component: string, points: readonly [time: number, value: number][]): AnimationTrack {
    const times = new Float32Array(points.length);
    const values = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) {
        times[i] = points[i][0];
        values[i] = points[i][1];
    }
    return { targetIndex: 0, component, times, values, interpolation: "linear" };
}

function createTestDb() {
    // The `placeholder` resource exists only to consume entity id 0, which the
    // animation code treats as a sentinel "no target". In real scenes the
    // first non-resource entity is never 0 either.
    return Database.create(Database.Plugin.create({
        extends: animation,
        components: {
            value: F32.schema,
        },
        resources: {
            placeholder: { default: 0 as number },
        },
        archetypes: {
            Target: ["value"],
        },
        transactions: {
            insertTarget(t): number {
                return t.archetypes.Target.insert({ value: 0 });
            },
        },
    }));
}

const linearClip = (db: ReturnType<typeof createTestDb>) =>
    db.transactions.insertAnimationClip({
        tracks: [scalarTrack("value", [[0, 0], [1, 10]])],
        duration: 1,
    });

describe("animation.advanceAnimations", () => {
    it("advances time and writes the sampled value to the target", () => {
        const db = createTestDb();
        const targetId = db.transactions.insertTarget() as number;
        const clipId = linearClip(db);
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [targetId],
        });

        db.transactions.advanceAnimations({ dt: 0.25, observable: false });

        // 0.25s into a 1s clip linearly interpolating 0→10 → value = 2.5.
        expect(db.read(targetId)?.value).toBeCloseTo(2.5, 5);
    });

    it("loops time within the clip duration", () => {
        const db = createTestDb();
        const targetId = db.transactions.insertTarget() as number;
        const clipId = linearClip(db);
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [targetId],
            animationLoop: true,
        });

        db.transactions.advanceAnimations({ dt: 2.25, observable: false });

        // 2.25 % 1 = 0.25 → same sampled value as the first test.
        expect(db.read(targetId)?.value).toBeCloseTo(2.5, 5);
    });

    it("stops a non-looping player when it reaches duration", () => {
        const db = createTestDb();
        const targetId = db.transactions.insertTarget() as number;
        const clipId = linearClip(db);
        const playerId = db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [targetId],
            animationLoop: false,
        }) as number;

        db.transactions.advanceAnimations({ dt: 2, observable: false });

        const player = db.read(playerId);
        expect(player?.animationTime).toBe(1);
        expect(player?.animationPlaying).toBe(false);
    });

    it("only touches players whose animationObservable flag matches the args", () => {
        const db = createTestDb();
        const observableTarget = db.transactions.insertTarget() as number;
        const directTarget     = db.transactions.insertTarget() as number;
        const clipId = linearClip(db);
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [observableTarget],
            observable: true,
        });
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [directTarget],
        });

        // observable: true touches only the flagged player.
        db.transactions.advanceAnimations({ dt: 0.5, observable: true });
        expect(db.read(observableTarget)?.value).toBeCloseTo(5, 5);
        expect(db.read(directTarget)?.value).toBe(0);

        // observable: false touches only the non-flagged player.
        db.transactions.advanceAnimations({ dt: 0.5, observable: false });
        expect(db.read(directTarget)?.value).toBeCloseTo(5, 5);
    });

    it("fires entity observers for the observable path and skips them for the direct path", () => {
        const db = createTestDb();
        const observableTarget = db.transactions.insertTarget() as number;
        const directTarget     = db.transactions.insertTarget() as number;
        const clipId = linearClip(db);
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [observableTarget],
            observable: true,
        });
        db.transactions.insertAnimation({
            animationClipRef: clipId,
            animationTargets: [directTarget],
        });

        const observableNotifications: number[] = [];
        const directNotifications: number[] = [];
        db.observe.entity(observableTarget)(v => { if (v) observableNotifications.push(v.value as number); });
        db.observe.entity(directTarget)(v => { if (v) directNotifications.push(v.value as number); });
        // Drop the initial-value notifications.
        observableNotifications.length = 0;
        directNotifications.length = 0;

        // Observable path: writes flow through the transaction → observers fire.
        db.transactions.advanceAnimations({ dt: 0.5, observable: true });
        expect(observableNotifications.length).toBeGreaterThan(0);
        expect(directNotifications.length).toBe(0);

        // Direct path: same `advanceAnimations` body, but with the raw store
        // as `t`. Underlying value changes; observers must stay silent.
        // (`db.store` is exposed at runtime but not on the public Database
        // type — systems get a `Database & { store }` view; tests reach in.)
        const directStore = (db as unknown as { store: Store<any, any, any> }).store;
        const before = db.read(directTarget)?.value;
        animation.transactions.advanceAnimations(directStore, { dt: 0.5, observable: false });
        const after = db.read(directTarget)?.value;
        expect(after).not.toBe(before);
        expect(directNotifications.length).toBe(0);
    });
});
