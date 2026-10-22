// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * The label reports and errors give it, which needn't be unique: the value its constructor returns is its identity, so
 * separately written code can't collide by name. Namespacing it (`"physics/integrate"`) keeps labels short. Without
 * one, it's labeled by its binding and the id the plugin gave it, or else by its kind numbered.
 */
export type Name = string;
