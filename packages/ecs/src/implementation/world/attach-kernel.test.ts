// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { kernelOf } from "./attach-kernel.js";

it("rejects a kernel lookup of a string, which kernels don't read, where the kernel is declared", async () => {
    await expect(import("./kernel-lookup.test-helper.js")).rejects.toThrow(`a lookup reads "kernelLookupTest/label", a string, which kernels don't read yet.`);
});

it("rejects a compiled kernel that doesn't match its schemas where the kernel is declared", async () => {
    await expect(import("./kernel-path.test-helper.js")).rejects.toThrow(`"kernelPathTest/pair" has no scalar at [2]; destructure tuples and structs or index their fields.`);
});

it("compiles an unflagged system whose body fits, and runs as written one whose kernel wouldn't match its schemas", async () => {
    const { doubled, labels } = await import("./kernel-tried.test-helper.js");
    expect(kernelOf(doubled)).toBeDefined();
    expect(kernelOf(labels)).toBeUndefined();
});
