import type { Schema } from "../../schema/schema.js";
import { schema as item } from "../f32/schema.js";

export const schema = { type: "array", items: item, minItems: 16, maxItems: 16 } as const satisfies Schema;
