// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Declaration } from './declaration.js';
import type { Name } from './name.js';

/**
 * A system that runs a body: `"render"` for one made by `render`, `"system"` otherwise. Its body's parameters are
 * checked where it's created, so a leaf holds any body.
 */
export type Leaf = {
    readonly kind: "system" | "render";
    readonly name: Name;
    readonly declaration: Declaration;
    readonly body: (...parameters: never[]) => void;
};
