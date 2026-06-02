// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

/**
 * A physical material. A closed set whose members are named only inside this
 * folder; consumers iterate `Material.list` or read `Material.properties`.
 */
export type Material = Schema.ToType<typeof schema>;
export * as Material from "./public.js";
