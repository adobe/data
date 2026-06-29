// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";
import { Callback } from "./callback.js";

export interface Volume<T> {
    get(x: number, y: number, z: number): T;
    set(x: number, y: number, z: number, value: T): void;
    iterate(callback: Callback<T>): void;
    readonly size: Vec3;
}

export * as Volume from "./public.js";
