// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";
import type { AnimationTrack } from "./animation-track.js";
import { interpolate } from "./interpolate.js";

/**
 * Samples a track at `time` and returns the interpolated component value.
 * `time` must already be wrapped into the clip's [0, duration] range by the caller.
 */
export function sample(track: AnimationTrack, schema: Schema, time: number): number | number[] {
    const { times, values } = track;
    const keyCount = times.length;
    const stride = values.length / keyCount;

    if (keyCount === 1 || time <= times[0]) {
        return readKey(values, 0, stride);
    }
    const last = keyCount - 1;
    if (time >= times[last]) {
        return readKey(values, last, stride);
    }

    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= time) lo = mid;
        else hi = mid;
    }

    const tPrev = times[lo];
    const tNext = times[hi];
    const span = tNext - tPrev;
    const t = span > 0 ? (time - tPrev) / span : 0;

    const prev = readKey(values, lo, stride);
    const next = readKey(values, hi, stride);
    return interpolate(schema, track.interpolation, prev, next, t);
}

function readKey(values: Float32Array, index: number, stride: number): number | number[] {
    if (stride === 1) return values[index];
    const out = new Array<number>(stride);
    const base = index * stride;
    for (let i = 0; i < stride; i++) out[i] = values[base + i];
    return out;
}
