// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, vi } from "vitest";
import { requireService } from "./require-service.js";

function guard(render: (this: { service?: unknown }) => unknown) {
    return requireService()({}, "render", { value: render }).value as (this: { service?: unknown }) => unknown;
}

describe("requireService", () => {
    it("returns null without calling render while there is no service", () => {
        const render = vi.fn(() => "rendered");
        expect(guard(render).call({})).toBeNull();
        expect(render).not.toHaveBeenCalled();
    });

    it("calls render with the receiver once a service is set", () => {
        const host = { service: {} as unknown };
        const render = vi.fn(function (this: unknown) { return this; });
        expect(guard(render).call(host)).toBe(host);
    });

    it("propagates errors from render", () => {
        const render = () => { throw new Error("render failed"); };
        expect(() => guard(render).call({ service: {} })).toThrow("render failed");
    });

    it("returns the descriptor it modified", () => {
        const descriptor: PropertyDescriptor = { value: () => 1 };
        expect(requireService()({}, "render", descriptor)).toBe(descriptor);
    });
});
