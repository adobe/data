// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";

export const schema = { type: "string", enum: ["linear", "step", "cubicSpline"] } as const satisfies Schema;
