// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";
import type { shown } from "./constant.shown.js";

/** An element showing an entity. */
export type Attached = { readonly [shown]: Entity };
