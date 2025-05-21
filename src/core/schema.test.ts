/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { type FromSchema, type Schema } from "./schema/schema.js";
import { type Extends, type False, type True } from "../types/types.js";
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
    type MyType = FromSchema<typeof mySchema>;

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
