// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { todosOf } from "./function.todos-of.js";

/** The todos' labels, in list order. */
export const labelsOf = async (world: World): Promise<string[]> => (await todosOf(world)).map(item => item.label);
