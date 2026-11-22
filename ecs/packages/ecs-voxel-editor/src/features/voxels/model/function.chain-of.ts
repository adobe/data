// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import type { Editing } from "./type.editing.js";

/** The instances entered, in order from the root, null editing entering none. */
export const chainOf = (editing: Editing | null): readonly Entity[] => editing === null ? [] : editing.chain.slice(0, editing.depth);
