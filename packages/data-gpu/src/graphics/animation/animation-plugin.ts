// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Boolean, F32, Time, True, type Schema } from "@adobe/data/schema";
import { AnimationTrack } from "./animation-track/animation-track.js";

/**
 * Data model for the animation plugin. Split from the system plugin below so
 * `advanceAnimations` can declare its `t` parameter as the *store* type
 * (`Database.Plugin.ToStore<typeof animationData>`) instead of the wider
 * `TransactionContext`. The system then calls the transaction body with
 * `db.store` directly — no cast, no `userId` mismatch — to write rows without
 * triggering observers (the high-throughput path for skinning and procedural
 * motion).
 *
 * Three archetypes:
 *
 * - **AnimationClip** — shared asset. Tracks + duration. Tracks reference
 *   targets by *index* into the player's `animationTargets` array, never by
 *   entity id, so the same clip drives many instances with different targets.
 *
 * - **Animation** — per-instance playback. Clip ref, targets, playback state.
 *   Default path: writes go directly to the store; observers do NOT fire.
 *
 * - **AnimationObservable** — same shape plus the `animationObservable` flag,
 *   which puts the row in this archetype instead of `Animation`. Writes flow
 *   through the transaction dispatcher so observers see them. Picking the
 *   archetype at insert time avoids the row migration an `update` would cost.
 */
const animationData = Database.Plugin.create({
    components: {
        animationClipTracks:   { default: [] as AnimationTrack[] },
        animationClipDuration: Time.schema,
        animationClipRef:      Entity.schema,
        animationTargets:      { default: [] as Entity[] },
        animationTime:         Time.schema,
        animationSpeed:        { ...F32.schema, default: 1 },
        animationLoop:         Boolean.schema,
        animationPlaying:      Boolean.schema,
        /** Archetype marker. The value is always `true`; what matters is
         *  whether the entity lives in `AnimationObservable` or `Animation`. */
        animationObservable:   True.schema,
    },
    archetypes: {
        AnimationClip: ["animationClipTracks", "animationClipDuration"],
        Animation: [
            "animationClipRef",
            "animationTargets",
            "animationTime",
            "animationSpeed",
            "animationLoop",
            "animationPlaying",
        ],
        AnimationObservable: [
            "animationClipRef",
            "animationTargets",
            "animationTime",
            "animationSpeed",
            "animationLoop",
            "animationPlaying",
            "animationObservable",
        ],
    },
});

type AnimationStore = Database.Plugin.ToStore<typeof animationData>;

export const animation = Database.Plugin.create({
    extends: animationData,
    transactions: {
        insertAnimationClip(t, args: { tracks: AnimationTrack[]; duration: number }): number {
            return t.archetypes.AnimationClip.insert({
                animationClipTracks: args.tracks,
                animationClipDuration: args.duration,
            });
        },
        insertAnimation(
            t,
            args: {
                animationClipRef: number;
                animationTargets: number[];
                animationTime?: number;
                animationSpeed?: number;
                animationLoop?: boolean;
                animationPlaying?: boolean;
                observable?: boolean;
            },
        ): number {
            const values = {
                animationClipRef: args.animationClipRef,
                animationTargets: args.animationTargets,
                animationTime: args.animationTime ?? 0,
                animationSpeed: args.animationSpeed ?? 1,
                animationLoop: args.animationLoop ?? false,
                animationPlaying: args.animationPlaying ?? true,
            };
            return args.observable
                ? t.archetypes.AnimationObservable.insert({ ...values, animationObservable: true })
                : t.archetypes.Animation.insert(values);
        },
        advanceAnimations(t: AnimationStore, args: { dt: number; observable: boolean }) {
            const componentSchemas = t.componentSchemas as Record<string, Schema>;
            const arch = args.observable ? t.archetypes.AnimationObservable : t.archetypes.Animation;
            const ids = arch.columns.id;
            const clipRefs = arch.columns.animationClipRef;
            const targetsCol = arch.columns.animationTargets;
            const times = arch.columns.animationTime;
            const speeds = arch.columns.animationSpeed;
            const loops = arch.columns.animationLoop;
            const playings = arch.columns.animationPlaying;
            const { dt } = args;
            const rowCount = arch.rowCount;
            for (let i = 0; i < rowCount; i++) {
                if (!playings.get(i)) continue;
                const playerId = ids.get(i);
                const clipId = clipRefs.get(i);
                const clip = t.read(clipId);
                if (!clip?.animationClipTracks || !clip.animationClipDuration || clip.animationClipDuration <= 0) continue;

                const speed = speeds.get(i);
                const loop = loops.get(i);
                const duration = clip.animationClipDuration;
                let newTime = times.get(i) + dt * speed;
                if (loop) {
                    newTime = ((newTime % duration) + duration) % duration;
                } else if (newTime >= duration) {
                    newTime = duration;
                    t.update(playerId, { animationPlaying: false });
                } else if (newTime < 0) {
                    newTime = 0;
                }
                t.update(playerId, { animationTime: newTime });

                const targets = targetsCol.get(i);
                for (const track of clip.animationClipTracks) {
                    const target = targets[track.targetIndex];
                    if (target === undefined || target === 0) continue;
                    const schema = componentSchemas[track.component];
                    if (!schema) continue;
                    const value = AnimationTrack.sample(track, schema, newTime);
                    t.update(target, { [track.component]: value });
                }
            }
        },
    },
    systems: {
        animationSampleSystem: {
            create: db => {
                let lastTime = performance.now();
                return () => {
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;
                    if (dt <= 0) return;
                    // Observable players: dispatched through transactions so
                    // observers fire when a target's component changes.
                    db.transactions.advanceAnimations({ dt, observable: true });
                    // Non-observable players: same body, but with the raw
                    // store as `t`. Writes go straight to columns and skip
                    // observer notification — right path for skinning and
                    // large procedural animations.
                    animation.transactions.advanceAnimations(db.store, { dt, observable: false });
                };
            },
        },
    },
});
