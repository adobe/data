// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { schema } from "./schema";

export type BoardState = Schema.ToType<typeof schema>;
export * as BoardState from "./public";
