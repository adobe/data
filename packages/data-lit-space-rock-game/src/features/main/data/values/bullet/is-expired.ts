// © 2026 Adobe. MIT License. See /LICENSE for details.
import { lifetime } from "./lifetime.js";

// Whether a bullet at `age` will have outlived its lifetime by the end of a
// `dt` tick — the step drops it instead of advancing it.
export const isExpired = (age: number, dt: number): boolean => age + dt >= lifetime;
