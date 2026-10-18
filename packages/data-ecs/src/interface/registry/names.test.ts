import { describe, expect, it } from "vitest";
import type { AnyDeclaration } from "./declarations.js";
import { claimKey, declarationOf, kindOf, labelOf } from "./names.js";

/** Declarations as registration records them; claiming a key doesn't check them. */
const number: AnyDeclaration = { type: { type: "number" } };
const boolean: AnyDeclaration = { type: { type: "boolean" } };

describe("claimKey", () => {
    it("accepts a plain symbol, with or without a description", () => {
        const described = Symbol("claimKey/described");
        const anonymous = Symbol();
        claimKey(described, "component", { type: { type: "number" } });
        claimKey(anonymous, "resource", number);
        expect([kindOf(described), kindOf(anonymous)]).toEqual(["component", "resource"]);
        expect(declarationOf(anonymous)).toBe(number);
    });
    it("keys by identity: symbols with one description are different keys", () => {
        const first = Symbol("claimKey/twin");
        const second = Symbol("claimKey/twin");
        claimKey(first, "component", { type: { type: "number" } });
        expect(() => claimKey(second, "resource", boolean)).not.toThrow();
        expect([kindOf(first), kindOf(second)]).toEqual(["component", "resource"]);
        expect(kindOf("claimKey/twin")).toBe(undefined);
    });
    it("rejects strings, Symbol.for symbols and well-known symbols, recording nothing", () => {
        const shared = Symbol.for("claimKey/shared");
        expect(() => claimKey("claimKey/text", "component", { type: { type: "number" } })).toThrow(`Cannot register component "claimKey/text": a key is a plain Symbol(...), not a string.`);
        expect(() => claimKey(1, "component", { type: { type: "number" } })).toThrow("a key is a plain Symbol(...), not a number.");
        expect(() => claimKey(shared, "resource", number)).toThrow("a Symbol.for key is shared across the program, so another could claim it; use Symbol(...).");
        expect(() => claimKey(Symbol.iterator, "trait")).toThrow("Symbol.iterator is a well-known symbol.");
        expect([kindOf(shared), kindOf(Symbol.iterator)]).toEqual([undefined, undefined]);
    });
    it("rejects a key claimed as another kind", () => {
        const key = Symbol("claimKey/crossKind");
        claimKey(key, "trait");
        expect(() => claimKey(key, "component", { type: { type: "number" } })).toThrow(`Cannot register component "claimKey/crossKind": already registered as a trait.`);
        expect(kindOf(key)).toBe("trait");
    });
});

describe("labelOf", () => {
    it("labels a key by its description, numbered by registration when another key has it, and never changes a label", () => {
        const first = Symbol("labelOf/twin");
        const second = Symbol("labelOf/twin");
        const third = Symbol("labelOf/twin");
        expect(labelOf(first)).toBe("labelOf/twin");
        claimKey(second, "component", { type: { type: "number" } });
        claimKey(first, "component", { type: { type: "number" } });
        claimKey(third, "trait");
        expect([labelOf(first), labelOf(second), labelOf(third)]).toEqual(["labelOf/twin#2", "labelOf/twin", "labelOf/twin#3"]);
    });
    it("gives a key without a description a numbered label, and names other values as text", () => {
        const anonymous = Symbol();
        expect(labelOf(anonymous)).toBe("Symbol()");
        claimKey(anonymous, "trait");
        expect(labelOf(anonymous)).toMatch(/^Symbol\(\)(#\d+)?$/);
        expect([labelOf("text"), labelOf(1)]).toEqual(["text", "1"]);
    });
});
