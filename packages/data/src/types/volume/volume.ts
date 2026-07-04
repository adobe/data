// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";
import type { AxisLineCallback } from "./axis-line-callback.js";
import type { BlockCallback } from "./block-callback.js";

export interface Volume<T> {
    get(x: number, y: number, z: number): T;
    set(x: number, y: number, z: number, value: T): void;
    iterateX(callback: AxisLineCallback<T>): void;
    iterateY(callback: AxisLineCallback<T>): void;
    iterateZ(callback: AxisLineCallback<T>): void;
    iterateBlocks(callback: BlockCallback<T>): void;
    readonly size: Vec3;
}

export * as Volume from "./public.js";
