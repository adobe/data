// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Schema } from "@adobe/data/schema";
import type { AnimationTrack } from "./animation-types.js";
import { sampleTrack } from "./sample-track.js";

/**
 * Generic animation plugin. Drives any component on any entity from a clip of
 * keyframe tracks. Per-type interpolation (e.g. slerp for Quat) is dispatched
 * through `schema.interpolators` — this plugin has no type-specific knowledge.
 *
 * Two archetypes:
 *
 * - **AnimationClip** — shared asset. Holds `animationClipTracks` (array of
 *   tracks) and `animationClipDuration`. Each track references a target by
 *   *index* into the player's `animationTargets` array, never by entity id,
 *   so the same clip can drive many instances each with their own targets.
 *
 * - **AnimationPlayer** — per-instance playback. Holds the clip ref, the list
 *   of target entity ids (in track-index order), playback state, and is
 *   advanced each frame by `animationSampleSystem`.
 */
export const animation = Database.Plugin.create({
    components: {
        animationClipTracks: { default: [] as AnimationTrack[] },
        animationClipDuration: { default: 0 as number },
        animationClipRef: { default: 0 as number },
        animationTargets: { default: [] as number[] },
        animationTime: { default: 0 as number },
        animationSpeed: { default: 1 as number },
        animationLoop: { default: false as boolean },
        animationPlaying: { default: false as boolean },
    },
    archetypes: {
        AnimationClip: ["animationClipTracks", "animationClipDuration"],
        AnimationPlayer: [
            "animationClipRef",
            "animationTargets",
            "animationTime",
            "animationSpeed",
            "animationLoop",
            "animationPlaying",
        ],
    },
    transactions: {
        insertAnimationClip(t, args: { tracks: AnimationTrack[]; duration: number }): number {
            return t.archetypes.AnimationClip.insert({
                animationClipTracks: args.tracks,
                animationClipDuration: args.duration,
            });
        },
        insertAnimationPlayer(
            t,
            args: {
                animationClipRef: number;
                animationTargets: number[];
                animationTime?: number;
                animationSpeed?: number;
                animationLoop?: boolean;
                animationPlaying?: boolean;
            },
        ): number {
            return t.archetypes.AnimationPlayer.insert({
                animationClipRef: args.animationClipRef,
                animationTargets: args.animationTargets,
                animationTime: args.animationTime ?? 0,
                animationSpeed: args.animationSpeed ?? 1,
                animationLoop: args.animationLoop ?? false,
                animationPlaying: args.animationPlaying ?? true,
            });
        },
        advanceAnimations(t, dt: number) {
            const componentSchemas = t.componentSchemas as Record<string, Schema>;
            for (const arch of t.queryArchetypes([
                "animationClipRef",
                "animationTargets",
                "animationTime",
                "animationSpeed",
                "animationLoop",
                "animationPlaying",
            ])) {
                const ids = arch.columns.id;
                const clipRefs = arch.columns.animationClipRef;
                const targetsCol = arch.columns.animationTargets;
                const times = arch.columns.animationTime;
                const speeds = arch.columns.animationSpeed;
                const loops = arch.columns.animationLoop;
                const playings = arch.columns.animationPlaying;
                const rowCount = arch.rowCount;
                for (let i = 0; i < rowCount; i++) {
                    if (!playings.get(i)) continue;
                    const playerId = ids.get(i) as number;
                    const clipId = clipRefs.get(i) as number;
                    const clip = t.read(clipId) as
                        | { animationClipTracks: AnimationTrack[]; animationClipDuration: number }
                        | null;
                    if (!clip || clip.animationClipDuration <= 0) continue;

                    const speed = speeds.get(i) as number;
                    const loop = loops.get(i) as boolean;
                    const duration = clip.animationClipDuration;
                    let newTime = (times.get(i) as number) + dt * speed;
                    if (loop) {
                        newTime = ((newTime % duration) + duration) % duration;
                    } else if (newTime >= duration) {
                        newTime = duration;
                        t.update(playerId, { animationPlaying: false });
                    } else if (newTime < 0) {
                        newTime = 0;
                    }
                    t.update(playerId, { animationTime: newTime });

                    const targets = targetsCol.get(i) as number[];
                    for (const track of clip.animationClipTracks) {
                        const target = targets[track.targetIndex];
                        if (target === undefined || target === 0) continue;
                        const schema = componentSchemas[track.component];
                        if (!schema) continue;
                        const value = sampleTrack(track, schema, newTime);
                        t.update(target, { [track.component]: value });
                    }
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
                    db.transactions.advanceAnimations(dt);
                };
            },
        },
    },
});
