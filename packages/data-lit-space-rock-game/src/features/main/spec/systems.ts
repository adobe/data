// © 2026 Adobe. MIT License. See /LICENSE for details.

// The spec of each ECS system, named exactly like it; one `*.cases.ts` module each.
// Their frame order is not authored here: conformance folds them in the order the
// systems' `schedule`s declare.
export { control } from "./control.js";
export { movement } from "./movement.js";
export { lifetime } from "./lifetime.js";
export { collision } from "./collision.js";
export { waves } from "./waves.js";
