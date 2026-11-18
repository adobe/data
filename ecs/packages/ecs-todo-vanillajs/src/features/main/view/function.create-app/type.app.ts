// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";

/** A running app: its world, and what stops it and removes what it put on the page. */
export type App = { readonly world: World; readonly dispose: () => Promise<void> };
