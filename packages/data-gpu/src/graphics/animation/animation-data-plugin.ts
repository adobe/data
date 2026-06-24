// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Boolean, F32, Time, True, type Schema } from "@adobe/data/schema";
import { AnimationTrack } from "../animation/animation-track/animation-track.js";

const animationBase = Database.Plugin.create({
    components: {
        animationClipTracks:   { default: [] as AnimationTrack[] },
        animationClipDuration: Time.schema,
        animationClipRef:      Entity.schema,
        animationTargets:      { default: [] as Entity[] },
        animationTime:         Time.schema,
        animationSpeed:        { ...F32.schema, default: 1 },
        animationLoop:         Boolean.schema,
        animationPlaying:      Boolean.schema,
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

type AnimationStore = Database.Plugin.ToStore<typeof animationBase>;

export const animationData = Database.Plugin.create({
    extends: animationBase,
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
});
