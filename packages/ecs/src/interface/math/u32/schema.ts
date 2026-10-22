import type { Schema } from "../../schema/schema.js";

export const schema = { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } as const satisfies Schema;
