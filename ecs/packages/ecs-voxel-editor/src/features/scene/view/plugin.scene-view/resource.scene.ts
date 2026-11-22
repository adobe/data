// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Mat4x4, Vec3 } from "@adobe/ecs";

/** What the sky's shader knows of the view beyond its projection: that projection's inverse, and the eye. Null until the camera is first aimed. */
export const scene = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [scene]: { type: { readonly inverseViewProjection: Mat4x4; readonly eye: Vec3 } | null; thread: "world" };
    }
}
