import { expect, it } from "vitest";

it("rejects a kernel lookup of a value outside linear memory where the kernel is declared", async () => {
    await expect(import("./kernel-lookup.test-helper.js")).rejects.toThrow(`Kernel "kernelLookupTest/labels": a lookup reads "kernelLookupTest/label", which isn't stored in linear memory.`);
});

it("rejects a compiled kernel that doesn't match its schemas where the kernel is declared", async () => {
    await expect(import("./kernel-path.test-helper.js")).rejects.toThrow(`Kernel "kernelPathTest/beyond": "kernelPathTest/pair" has no scalar at [2]; destructure tuples and structs or index their fields.`);
});
