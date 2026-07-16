import { Schema } from "@adobe/data/schema"

export const delta = Schema.fromObjectProperties({
    name: { type: "string", minLength: 1, maxLength: 100 },
    birthYear: { type: "number", minimum: 1900 },
    birthMonth: { type: "number", minimum: 1, maximum: 12 },
    birthDay: { type: "number", minimum: 1, maximum: 31 },
});
