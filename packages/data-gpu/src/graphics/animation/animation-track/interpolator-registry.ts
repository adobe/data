// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Quat } from "@adobe/data/math";

type Interpolator = (prev: any, next: any, t: number) => any;

/**
 * Resolves the serializable interpolator NAMES a pure-JSON `Schema` may declare
 * (e.g. `Quat.schema`'s `interpolators.linear = "slerp"`) to their functions.
 * The schema names the interpolator; the animation system owns the behavior.
 */
export const interpolatorRegistry: Readonly<Record<string, Interpolator>> = {
    slerp: Quat.slerp,
};
