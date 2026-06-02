// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A physical material. A closed set whose members are named only inside this
 * folder; consumers iterate `Material.list` or read `Material.properties`.
 */
export type Material = "rubber" | "wood" | "stone" | "steel" | "ice";
export * as Material from "./public.js";
