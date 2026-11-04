// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { bindCompletion } from "./system.bind-completion.js";

/** Completion's DOM system: showing the counts. */
export const systems: readonly System[] = [bindCompletion];
