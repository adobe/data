// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";

/** A running app: its world, whether it has a GPU device to draw the scene with, and what stops it. */
export type App = { readonly world: World; readonly drawn: boolean; readonly dispose: () => Promise<void> };
