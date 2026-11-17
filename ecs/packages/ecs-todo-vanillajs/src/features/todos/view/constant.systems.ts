// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { bindRows } from "./system.bind-rows.js";
import { renderRows } from "./system.render-rows.js";

/** The todos' DOM systems: rendering the rows the list needs, and writing what changed of their todos. */
export const systems: readonly System[] = [renderRows, bindRows];
