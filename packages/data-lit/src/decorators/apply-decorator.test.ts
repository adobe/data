// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, vi } from "vitest";
import { applyDecorator } from "./apply-decorator.js";

const double = (_target: unknown, _key: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (this: unknown) => number;
    return { ...descriptor, value(this: unknown) { return original.call(this) * 2; } };
};

describe("applyDecorator", () => {
    it("decorates a method found on the prototype chain and defines it on the target", () => {
        class Base { value = 2; get() { return this.value; } }
        class Derived extends Base {}
        applyDecorator(Derived.prototype, "get", double);
        expect(new Derived().get()).toBe(4);
        expect(new Base().get()).toBe(2);
        expect(Object.prototype.hasOwnProperty.call(Derived.prototype, "get")).toBe(true);
    });

    it("decorates an own property and passes target, key, and descriptor", () => {
        const method = () => 1;
        const target = { method };
        const decorator = vi.fn((_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor);
        applyDecorator(target, "method", decorator);
        expect(decorator).toHaveBeenCalledWith(target, "method", expect.objectContaining({ value: method }));
    });

    it("defines exactly the descriptor the decorator returns", () => {
        const target = { method: () => 1 };
        applyDecorator(target, "method", () => ({ value: 5, enumerable: false, writable: false, configurable: true }));
        expect(Object.getOwnPropertyDescriptor(target, "method")).toEqual({ value: 5, enumerable: false, writable: false, configurable: true });
    });

    it("throws when the property is not on the prototype chain", () => {
        expect(() => applyDecorator({}, "missing", double)).toThrow("Property missing not found in prototype chain");
    });
});
