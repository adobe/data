// © 2026 Adobe. MIT License. See /LICENSE for details.

// The spec of each ECS system, named exactly like it. The frame order is not authored
// here; it comes from the systems' `schedule` declarations.
export { movement } from "./movement.js";
export { collision } from "./collision.js";
