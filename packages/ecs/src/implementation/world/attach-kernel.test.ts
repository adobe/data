import { expect, it } from "vitest";

it("rejects a kernel lookup of a string, which kernels don't read, where the kernel is declared", async () => {
    await expect(import("./kernel-lookup.test-helper.js")).rejects.toThrow(`Kernel "kernelLookupTest/labels": a lookup reads "kernelLookupTest/label", a string, which kernels don't read yet.`);
});

it("rejects a compiled kernel that doesn't match its schemas where the kernel is declared", async () => {
    await expect(import("./kernel-path.test-helper.js")).rejects.toThrow(`Kernel "kernelPathTest/beyond": "kernelPathTest/pair" has no scalar at [2]; destructure tuples and structs or index their fields.`);
});
