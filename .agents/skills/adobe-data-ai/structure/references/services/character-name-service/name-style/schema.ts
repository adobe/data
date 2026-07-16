import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["fantasy", "sci-fi", "modern"],
} as const satisfies Schema;
