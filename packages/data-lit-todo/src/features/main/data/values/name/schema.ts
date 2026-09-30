// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { Name } from "./name.js";
import { Schema } from "@adobe/data/schema";

export const schema = { type: "string" } as const satisfies Schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, Name>>;
