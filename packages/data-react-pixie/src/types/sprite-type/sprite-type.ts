// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema";

export type SpriteType = Schema.ToType<typeof schema>;
export * as SpriteType from "./public";
