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
import { describe, it, expect } from "vitest";
import { createStore } from "../../store/create-store.js";
import { createTransactionalStore } from "./create-transactional-store.js";
import { F32Schema } from "../../../schema/f32.js";
import { Schema } from "../../../schema/schema.js";

const positionSchema = {
    type: "object",
    properties: {
        x: F32Schema,
        y: F32Schema,
        z: F32Schema,
    },
    required: ["x", "y", "z"],
    additionalProperties: false,
} as const satisfies Schema;

describe("Transient resource support", () => {
    it("should mark transaction as transient when updating a transient resource", () => {
        const baseStore = createStore(
            { position: positionSchema },
            {
                time: { default: { delta: 0.016, elapsed: 0 } },
                mousePosition: { default: { x: 0, y: 0 }, transient: true }
            }
        );

        const store = createTransactionalStore(baseStore);

        // Update regular resource - should NOT be transient
        const regularResult = store.execute((t) => {
            t.resources.time = { delta: 0.033, elapsed: 1.0 };
        });

        expect(regularResult.transient).toBe(false);

        // Update transient resource - should BE transient
        const transientResult = store.execute((t) => {
            t.resources.mousePosition = { x: 100, y: 200 };
        });

        expect(transientResult.transient).toBe(true);
    });

    it("should mark transaction as transient when updating multiple transient resources", () => {
        const baseStore = createStore(
            { position: positionSchema },
            {
                mousePosition: { default: { x: 0, y: 0 }, transient: true },
                mouseVelocity: { default: { x: 0, y: 0 }, transient: true }
            }
        );

        const store = createTransactionalStore(baseStore);

        const result = store.execute((t) => {
            t.resources.mousePosition = { x: 100, y: 200 };
            t.resources.mouseVelocity = { x: 5, y: 10 };
        });

        expect(result.transient).toBe(true);
    });

    it("should mark transaction as transient when updating both regular and transient resources", () => {
        const baseStore = createStore(
            { position: positionSchema },
            {
                time: { default: { delta: 0.016, elapsed: 0 } },
                mousePosition: { default: { x: 0, y: 0 }, transient: true }
            }
        );

        const store = createTransactionalStore(baseStore);

        // Update both - should be transient because one of them is transient
        const result = store.execute((t) => {
            t.resources.time = { delta: 0.033, elapsed: 1.0 };
            t.resources.mousePosition = { x: 100, y: 200 };
        });

        expect(result.transient).toBe(true);
    });

    it("should not mark transaction as transient when only updating regular resources", () => {
        const baseStore = createStore(
            { position: positionSchema },
            {
                time: { default: { delta: 0.016, elapsed: 0 } },
                score: { default: 0 },
                mousePosition: { default: { x: 0, y: 0 }, transient: true }
            }
        );

        const store = createTransactionalStore(baseStore);

        const result = store.execute((t) => {
            t.resources.time = { delta: 0.033, elapsed: 1.0 };
            t.resources.score = 100;
        });

        expect(result.transient).toBe(false);
    });

    it("should allow explicit transient override to take precedence", () => {
        const baseStore = createStore(
            { position: positionSchema },
            {
                mousePosition: { default: { x: 0, y: 0 }, transient: true }
            }
        );

        const store = createTransactionalStore(baseStore);

        // Even though resource is transient, explicit transient: false should win
        const result = store.execute((t) => {
            t.resources.mousePosition = { x: 100, y: 200 };
        }, { transient: false });

        expect(result.transient).toBe(false);
    });
});

