// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";

/**
 * Orbit camera state — a polar arrangement around a center point with an
 * auto-spin and a one-shot auto-fit to a Geometry's bounds.
 *
 *   - `center` / `radius` / `height` / `angle` define the camera placement.
 *   - `nearFactor` / `farFactor` scale the near and far planes so they
 *     track the orbit radius (models authored in any unit render without
 *     clipping).
 *   - `autoSpin` / `autoSpinSpeed` rotate the camera each frame when the
 *     user isn't dragging.
 *   - `fitGeometry` is an entity id; when non-zero, the auto-fit system
 *     reads that Geometry's bounds on the first available frame, sizes the
 *     orbit, and zeros the field. `fitRadiusFactor` / `fitHeightFactor` /
 *     `fitRadiusOffset` / `fitCenter` shape the fit.
 */
export interface Orbit {
    center: Vec3;
    radius: number;
    height: number;
    angle: number;
    autoSpin: boolean;
    autoSpinSpeed: number;
    nearFactor: number;
    farFactor: number;
    fitGeometry: number;
    fitRadiusFactor: number;
    fitHeightFactor: number;
    fitRadiusOffset: number;
    fitCenter: Vec3 | null;
}

export * as Orbit from "./public.js";
