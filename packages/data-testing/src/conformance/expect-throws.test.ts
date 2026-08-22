// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { expectThrows } from "./expect-throws.js";

describe("expectThrows", () => {
  it("resolves when the call throws and `true` accepts any message", async () => {
    await expect(
      expectThrows(() => {
        throw new Error("nope");
      }, true),
    ).resolves.toBeUndefined();
  });

  it("resolves when the thrown message contains the expected substring", async () => {
    await expect(
      expectThrows(() => {
        throw new Error("invalid quantity: -1");
      }, "invalid quantity"),
    ).resolves.toBeUndefined();
  });

  it("rejects when the thrown message does not contain the expected substring", async () => {
    await expect(
      expectThrows(() => {
        throw new Error("something else");
      }, "invalid quantity"),
    ).rejects.toThrow(/expected thrown error message to include/);
  });

  it("rejects when the call does not throw at all", async () => {
    await expect(expectThrows(() => 42, true)).rejects.toThrow(/expected a throw/);
  });

  it("supports an async call that rejects", async () => {
    await expect(
      expectThrows(async () => {
        throw new Error("async failure");
      }, "async failure"),
    ).resolves.toBeUndefined();
  });

  it("matches against a non-Error thrown value via String()", async () => {
    await expect(
      expectThrows(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "plain string failure";
      }, "string failure"),
    ).resolves.toBeUndefined();
  });
});
