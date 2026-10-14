import type { Declaration } from './declaration.js';

/**
 * A system that runs a body: `"render"` for one made by `render`, `"system"` otherwise. Its body's parameters are
 * checked where it's created, so a leaf holds any body.
 */
export type Leaf<D extends Declaration = Declaration> = {
    readonly kind: "system" | "render";
    readonly declaration: D;
    readonly body: (...parameters: never[]) => void;
};
