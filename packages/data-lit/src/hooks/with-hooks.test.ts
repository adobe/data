// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { ReactiveController } from "lit";
import { Component_stack } from "./component/stack.js";
import { withHooks } from "./with-hooks.js";
import { createHost } from "./test-host.test-utils.js";

function wrap<Args extends unknown[], Return>(method: (...args: Args) => Return) {
    return withHooks({}, "render", { value: method }).value!;
}

describe("withHooks", () => {
    it("makes the host active during the call and forwards arguments and return value", () => {
        const host = createHost();
        const render = wrap(function (this: unknown, a: number, b: number) {
            expect(Component_stack.active()).toBe(this);
            return a + b;
        });
        expect(render.call(host, 1, 2)).toBe(3);
        expect(Component_stack.active()).toBeUndefined();
    });

    it("resets the hook cursor before each call", () => {
        const host = createHost();
        host.hookIndex = 4;
        const render = wrap(() => Component_stack.active().hookIndex);
        expect(render.call(host)).toBe(0);
    });

    it("restores the stack when the method throws", () => {
        const host = createHost();
        const render = wrap(() => { throw new Error("render failed"); });
        expect(() => render.call(host)).toThrow("render failed");
        expect(Component_stack.active()).toBeUndefined();
    });

    it("installs the lifecycle controller once on a reactive host", () => {
        const host = Object.assign(createHost(), { addController: vi.fn((_: ReactiveController) => {}) });
        const render = wrap(() => {});
        render.call(host);
        render.call(host);
        expect(host.addController).toHaveBeenCalledTimes(1);
    });
});
