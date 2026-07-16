import { Schema } from "@adobe/data/schema";

export const schema = Schema.fromObjectProperties({
  id: { type: "string" },
  title: { type: "string" },
  updatedAt: { type: "string" },
});
