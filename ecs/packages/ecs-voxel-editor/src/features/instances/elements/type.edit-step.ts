// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A step of the path to the model being edited, as `<edit-path>` shows it: its label, its model, its library file where
 * it's referenced, and the depth of instances entered it's at, or null for a step to edit its model alone.
 */
export type EditStep = { readonly label: string; readonly model: number; readonly referenced: string | null; readonly depth: number | null };
