import { Schema } from "@adobe/data/schema";

export const alpha = { type: "number", minimum: 0.0, maximum: 1.0 } as const satisfies Schema;