// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { resolveExternalInvocation } from "./external.js";
import type { Schema } from "./schema.js";

const fn = (external?: Schema["external"]): Schema => ({
  type: "function",
  parameters: [],
  ...(external ? { external } : {}),
});

describe("resolveExternalInvocation", () => {
  it("defaults: link denied, agent allowed (no external)", () => {
    expect(resolveExternalInvocation(fn())).toEqual({ link: false, agent: true });
  });

  it("link is a default-deny whitelist — only link:true permits", () => {
    expect(resolveExternalInvocation(fn({ link: true })).link).toBe(true);
    expect(resolveExternalInvocation(fn({ link: false })).link).toBe(false);
    // absent link (even with agent set) ⇒ denied
    expect(resolveExternalInvocation(fn({ agent: true })).link).toBe(false);
  });

  it("agent is a default-allow blacklist — only agent:false denies", () => {
    expect(resolveExternalInvocation(fn({ agent: false })).agent).toBe(false);
    expect(resolveExternalInvocation(fn({ agent: true })).agent).toBe(true);
    // absent agent (even with link set) ⇒ allowed
    expect(resolveExternalInvocation(fn({ link: true })).agent).toBe(true);
  });

  it("channels resolve independently", () => {
    expect(resolveExternalInvocation(fn({ link: true, agent: false }))).toEqual({ link: true, agent: false });
  });
});
