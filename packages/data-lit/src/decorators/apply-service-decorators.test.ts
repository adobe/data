// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { applyServiceDecorators } from "./apply-service-decorators.js";
import { Component_stack } from "../hooks/component/stack.js";
import { useState } from "../hooks/use-state.js";

function createElement(render: (this: unknown) => unknown, service?: unknown) {
    return Object.assign(new EventTarget(), {
        service,
        hookIndex: 0,
        hooks: [] as unknown[],
        updatedListeners: new Set<() => void>(),
        requestUpdate: vi.fn(),
        isConnected: true,
        render,
    });
}

describe("applyServiceDecorators", () => {
    it("renders null without calling render while there is no service", () => {
        const render = vi.fn(() => "rendered");
        const element = createElement(render);
        applyServiceDecorators(element);
        expect(element.render()).toBeNull();
        expect(render).not.toHaveBeenCalled();
    });

    it("renders with hooks once a service is set", () => {
        const element = createElement(function (this: unknown) {
            expect(Component_stack.active()).toBe(this);
            return useState("value")[0];
        }, {});
        applyServiceDecorators(element);
        expect(element.render()).toBe("value");
        expect(Component_stack.active()).toBeUndefined();
    });

    it("decorates a render inherited from the prototype", () => {
        class Base { service = {}; render() { return "inherited"; } }
        const element = Object.assign(new Base(), { hooks: [], hookIndex: 0 });
        applyServiceDecorators(element);
        expect(Object.prototype.hasOwnProperty.call(element, "render")).toBe(true);
        expect(element.render()).toBe("inherited");
    });

    it("restores the hook stack when render throws", () => {
        const element = createElement(() => { throw new Error("render failed"); }, {});
        applyServiceDecorators(element);
        expect(() => element.render()).toThrow("render failed");
        expect(Component_stack.active()).toBeUndefined();
    });
});
