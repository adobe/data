// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Observe } from "../../observe/index.js";
import { fromPartialProperties } from "./from-partial-properties.js";

describe("fromPartialProperties", () => {
  it("emits unresolved members as undefined, then batches changes per microtask", async () => {
    const [a, setA] = Observe.createState(1);
    const [b, setB] = Observe.createState<string>();
    const values: unknown[] = [];
    const unobserve = fromPartialProperties({ a, b })((value) => values.push(value));
    expect(values).toEqual([{ a: 1, b: undefined }]);

    setA(2);
    setB("x");
    expect(values).toHaveLength(1);
    await Promise.resolve();
    expect(values).toEqual([{ a: 1, b: undefined }, { a: 2, b: "x" }]);

    setA(3);
    unobserve();
    await Promise.resolve();
    expect(values).toHaveLength(2);
  });
});
