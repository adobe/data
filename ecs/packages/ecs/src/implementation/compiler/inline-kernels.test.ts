// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { expect, test } from 'vitest';
import { inlineKernels, inlinePlaceholder } from './inline-kernels.js';

test("inlines each kernel's module as a data: url of its UTF-8 bytes, as node's Buffer encodes them", () => {
    const kernels = ["export const create = () => 'ü😀';\n", "export const create = () => 2;\n"];
    const code = `a(${JSON.stringify(inlinePlaceholder(0, "h0"))}, ${JSON.stringify(inlinePlaceholder(1, "h1"))});`;
    expect(inlineKernels(code, kernels, ["h0", "h1"])).toBe(`a(${kernels.map(source => JSON.stringify(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).join(", ")});`);
});
