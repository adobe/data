import type { Schema } from "../../../schema/schema.js";
import { schema as item } from "../../i32/schema.js";

export const schema = { type: "array", items: item, minItems: 2, maxItems: 2 } as const satisfies Schema;
