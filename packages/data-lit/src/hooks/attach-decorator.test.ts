// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, vi } from "vitest";
import { attachDecorator } from "./attach-decorator.js";

const double = (_target: unknown, _key: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (this: unknown, ...args: unknown[]) => number;
    return { ...descriptor, value(this: unknown, ...args: unknown[]) { return original.apply(this, args) * 2; } };
};

describe("attachDecorator", () => {
    it("decorates an inherited method and installs it on the instance", () => {
        class Base { value = 3; get() { return this.value; } }
        const instance = new Base();
        attachDecorator(instance, "get", double);
        expect(instance.get()).toBe(6);
        expect(Object.prototype.hasOwnProperty.call(instance, "get")).toBe(true);
        expect(new Base().get()).toBe(3);
    });

    it("decorates an own method", () => {
        const instance = { get: () => 2 };
        attachDecorator(instance, "get", double);
        expect(instance.get()).toBe(4);
    });

    it("passes the instance, property name, and current method to the decorator", () => {
        const method = () => 1;
        const instance = { method };
        const decorator = vi.fn((_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor);
        attachDecorator(instance, "method", decorator);
        expect(decorator).toHaveBeenCalledWith(instance, "method", expect.objectContaining({ value: method }));
    });

    it("applies repeated decorators in order", () => {
        const instance = { get: () => 1 };
        attachDecorator(instance, "get", double);
        attachDecorator(instance, "get", double);
        expect(instance.get()).toBe(4);
    });

    it("throws for a missing property", () => {
        const instance = {} as { missing?: () => void };
        expect(() => attachDecorator(instance, "missing", double)).toThrow("Property missing does not exist");
    });
});
