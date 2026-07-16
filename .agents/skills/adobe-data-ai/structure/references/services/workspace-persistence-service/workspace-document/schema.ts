import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["id", "title", "updatedAt"],
  additionalProperties: false,
} as const satisfies Schema;
