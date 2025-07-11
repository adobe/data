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

import { TrueSchema } from "../../../schema/true.js";
import { createDatabaseSchema } from "./create-database-schema.js";

// just a compile time test which is why we're using -test.ts extension instead of .test.ts

createDatabaseSchema(
    {
        velocity: { type: "number" },
        particle: TrueSchema,
    },
    {
        mousePosition: { type: "number", default: 0 },
        fooPosition: { type: "number", default: 0 },
    },
    {
        bar: ["particle", "velocity"],
        // @ts-expect-error
        foo: ["particle", "velocity2"] // should throw error because velocity2 is not a component
    },
    (store) => {
        return ({
            setMousePosition: (position: number) => {
                store.resources.mousePosition = position;
                // @ts-expect-error
                store.resources.mousePosition2 = position;
            },
        })
    }
)
