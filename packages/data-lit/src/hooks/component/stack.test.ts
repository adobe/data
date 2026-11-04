// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Component } from "./component.js";
import { Component_stack } from "./stack.js";

const createComponent = () => ({ hookIndex: 5 }) as unknown as Component;

describe("Component_stack", () => {
    it("makes the most recently pushed component active and restores the previous one on pop", () => {
        const outer = createComponent();
        const inner = createComponent();
        Component_stack.push(outer);
        Component_stack.push(inner);
        expect(Component_stack.active()).toBe(inner);
        Component_stack.pop();
        expect(Component_stack.active()).toBe(outer);
        Component_stack.pop();
        expect(Component_stack.active()).toBeUndefined();
    });

    it("resets the hook cursor and creates the slot array on push", () => {
        const component = createComponent();
        Component_stack.push(component);
        Component_stack.pop();
        expect(component.hookIndex).toBe(0);
        expect(component.hooks).toEqual([]);
    });

    it("keeps existing hook slots on push", () => {
        const component = createComponent();
        const hooks = [1, 2];
        component.hooks = hooks;
        Component_stack.push(component);
        Component_stack.pop();
        expect(component.hooks).toBe(hooks);
    });
});
