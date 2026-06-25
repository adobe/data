// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { FrameTime } from "./frame-time.js";

/**
 * Largest per-frame delta (seconds) the clock reports. A backgrounded tab or
 * the very first frame would otherwise produce a multi-second `dt` that throws
 * every time-stepped system off; clamping here means no consumer has to.
 */
const MAX_DELTA = 0.1;

/**
 * Publishes per-frame wall-clock timing as the `frameTime` resource. Declares
 * its system but does not extend the scheduler — so pure-data consumers (and
 * their tests) can pull in the `frameTime` resource without dragging in
 * `requestAnimationFrame`. Composed with a scheduler (via `core`), the system
 * runs in the first tier (no dependencies), so every later phase — update,
 * physics, render — reads a `dt`/`elapsed` already advanced for this frame.
 */
export const plugin = Database.Plugin.create({
    resources: {
        frameTime: {
            default: { now: 0, dt: 0, elapsed: 0 } satisfies FrameTime as FrameTime,
            nonPersistent: true,
        },
    },
    systems: {
        _frameTime: {
            create: db => {
                let last = 0;
                return () => {
                    const now = performance.now();
                    // first frame (last === 0) reports dt 0 — no work has elapsed yet
                    const raw = last === 0 ? 0 : (now - last) / 1000;
                    last = now;
                    const dt = raw < MAX_DELTA ? raw : MAX_DELTA;
                    const elapsed = db.store.resources.frameTime.elapsed + dt;
                    db.store.resources.frameTime = { now, dt, elapsed };
                };
            },
        },
    },
});
