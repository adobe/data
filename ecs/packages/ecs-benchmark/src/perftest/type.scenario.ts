// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import type { Sample } from "./type.sample.js";

/** A benchmark of the suite, by its name there, measured at a count of entities on worlds `create` makes. */
export type Scenario = { readonly name: string; readonly measure: (create: () => World, count: number) => Promise<Sample> };
