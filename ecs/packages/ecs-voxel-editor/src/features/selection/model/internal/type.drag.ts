// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import type { Face } from "./type.face.js";

/**
 * A selecting drag: the model it's in, the face it started on, whether it selects or deselects, every face the pointer has passed over,
 * and the faces it changed, by key, so a move covering others, as the keys held change its shape, puts those it no
 * longer covers back.
 */
export type Drag = {
    readonly model: Entity;
    readonly anchor: Face;
    readonly select: boolean;
    readonly painted: ReadonlyMap<string, Face>;
    readonly changed: ReadonlyMap<string, Face>;
};
