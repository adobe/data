// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "@adobe/ecs";
import { bindRows } from "./system.bind-rows.js";
import { createRows } from "./system.create-rows.js";
import { placeRows } from "./system.place-rows.js";

/** The todos' DOM systems: making, binding and placing their rows. */
export const systems: readonly System[] = [createRows, bindRows, placeRows];
