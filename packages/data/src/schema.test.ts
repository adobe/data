// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type Schema } from "./schema/index.js";
import { type Extends, type False, type True } from "./types/types.js";
import { describe, it } from "vitest";

describe("Schema", () => {
  it("should provide compile time and runtime type validation", () => {
    const mySchema = {
      type: "object",
      required: ["name", "aspect"],
      properties: {
        name: { type: "string" },
        age: { type: "integer", minimum: 0 },
        aspect: { enum: ["landscape", "portrait"] },
      },
      additionalProperties: false,
    } as const satisfies Schema;
    type MyType = Schema.ToType<typeof mySchema>;

    //  compile time type checking.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ShouldBeValid = True<
      Extends<{ name: "foo"; aspect: "landscape" }, MyType>
    >;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type WrongAspect = False<Extends<{ name: "foo"; aspect: "wrong" }, MyType>>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type MissingAspect = False<Extends<{ name: "foo" }, MyType>>;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ExtraPropertyCannotBeTypescriptTypeChecked = True<
      Extends<{ name: "foo"; aspect: "landscape"; agewrong: 1 }, MyType>
    >;
  });
});
