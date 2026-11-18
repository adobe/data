// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";
import type { Random } from "./type.random.js";

/** A generator's output and its state after it. */
export type RandomStep = { readonly value: U32; readonly state: Random };
