// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ColliderShape } from "./collider-shape.js";
import { schema } from "./schema.js";

/** Stable shape order — the index is the solver's numeric shape id. */
export const list: readonly ColliderShape[] = schema.enum;
