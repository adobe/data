// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import type { Lives } from "./lives.js";
import { Schema } from "@adobe/data/schema";
import { F32 } from "@adobe/data/math";

export const schema = F32.schema;

type _Pin = Assert<Equal<Schema.ToType<typeof schema>, Lives>>;
