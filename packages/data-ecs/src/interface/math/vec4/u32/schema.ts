import type { Schema } from "../../../schema/schema.js";
import { schema as item } from "../../u32/schema.js";

export const schema = { type: "array", items: item, minItems: 4, maxItems: 4 } as const satisfies Schema;
