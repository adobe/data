// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from "@adobe/ecs";
import { followEditing } from "./system.follow-editing.js";

/** The camera following editing: framing each model as it comes to be edited. */
export const cameraModel: Plugin = { systems: [followEditing] };
