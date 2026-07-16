import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type NameStyle = Schema.ToType<typeof schema>;
export * as NameStyle from "./public.js";
