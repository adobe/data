// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Console } from "node:console";
import { Writable } from "node:stream";
import { formatWithOptions } from "node:util";
import { expect, it } from "vitest";
import { formatLine, formatTable } from "./inspect.js";

/** How node writes a console call's values on one line, as the guide's `.out` files hold them. */
const node = (values: readonly unknown[]): string => formatWithOptions({ breakLength: Infinity, compact: true }, ...values);

/** An error with a stack of its own, so node and the guide write the same lines. */
const failure = (message: string, extra: object = {}): Error => {
    const error = Object.assign(new Error(message), extra);
    error.stack = `Error: ${message}\n    at a (f.js:1:1)\n    at b (f.js:2:2)`;
    return error;
};
class Point {
    readonly x = 1;
    readonly y = 2;
}
class Numbers extends Array<number> {}
const key = Symbol();
const cyclic: { a: number; self?: unknown; list?: unknown[] } = { a: 1 };
cyclic.self = cyclic;
cyclic.list = [cyclic];
const array: unknown[] = [1];
array.push(array);
const two: { x?: unknown } = {};
const one = { two };
two.x = one;
const shared = { v: 1 };
const caused = failure("outer", { cause: failure("inner") });
const plain = new Error("plain");
plain.stack = "Error: plain";

const calls: readonly (readonly unknown[])[] = [
    ["moved to", [1, 0, 0]], [[-9.8, -Infinity, new Map(), null, 0]], [new Map([["a", 1]]), new Set(["a"])], [{ outlined: 0, targeting: 1 }],
    [Array.from({ length: 27 }, (_, index) => index)], [Array.from({ length: 120 }, (_, index) => index)], ["it's", ["it's"], ["it's \"q\""], ["a`b'c\"d"], ["a\nb"]],
    [[undefined], -0, [-0], NaN, 1n, Symbol(), Symbol("a"), { [key]: 1, [Symbol("k")]: 2 }], [() => 1, function named() {}, class Named {}, Math.max],
    [new Float32Array([1, 2]), new Uint8Array(3), new Uint8Array(120)], [[[[[1]]]], { a: { b: { c: { d: 1 } } } }, { a: [{ b: { c: 1 } }] }, { nested: new Set([new Map([["k", [1, 2]]])]) }],
    [{ "a-b": 1, "1": 2, a_b: 3, $x: 4, "": 5, "01": 6 }], [new Array(3), [1, , 3], Object.assign([1, 2], { x: 3 }), new Array(200), Object.assign(new Array(3), { 1: "x" })],
    [{}, [], new Date(0), /a/g, null, undefined, true], [new Point(), { p: new Point() }], [Object.create(null), { a: Object.create(null) }],
    [{ a: undefined, get b() { return 1; } }], [new Map([[{ a: 1 }, [1, 2]]])], [Symbol.iterator, new Set(), new Date(Number.NaN)],
    // Objects within themselves, and one reached twice.
    [cyclic], [array], [{ one, two }], [{ a: shared, b: shared }],
    // More than a hundred entries.
    [new Map(Array.from({ length: 120 }, (_, index) => [index, index]))], [new Set(Array.from({ length: 103 }, (_, index) => index))],
    // Escapes, and a string too long.
    [["a\tb", "a\u0001b", "\x7f", "a\r\n", "\\'"]], [["${x}'\"`"]], [["x".repeat(10005)]],
    // What holds what the guide can't show item by item.
    [new WeakMap(), new WeakSet()], [new ArrayBuffer(2), new ArrayBuffer(60)], [new DataView(new ArrayBuffer(2))],
    // Errors: on their own, nested, with properties, and with a cause.
    [failure("top")], [[failure("in a list")]], [{ abc: failure("in an object") }], [{ a: { b: failure("deeper") } }], [[[failure("two lists")]]],
    [failure("with a code", { code: 3 })], [{ x: failure("nested with a code", { code: 3 }) }], [plain, { plain }], [caused],
    [Object.assign(() => 1, { a: 1 }), Object.assign(function named() {}, { b: 2 })], [new Numbers(2)], [[new Number(3)], new Boolean(true)],
    // Format specifiers.
    ["%s is %d", "x", 4, "rest"], ["%o and %O", { a: 1 }, [1]], ["100%", 1], ["%%"], ["%% %s", "x"], ["%c styled", "color: red"], ["%i %f %j", 4.7, "1.5", { a: 1 }], [], [3, "a"],
    ["%s", { a: { b: { c: 1 } } }], ["%s", [1, [2, [3]]]], ["%s", new Map([[1, { a: 1 }]])], ["%s %s %s", 1n, Symbol("q"), -0], ["%s", { toString: () => "T" }], ["%s", new Date(0)],
    ["%s %s", null, undefined], ["%d %d %d %i %f", 1.5, "x", 2n, "4.9", "x"], ["%O", { a: { b: { c: { d: 1 } } } }], ["%o", { a: { b: { c: { d: { e: 1 } } } } }], ["%j", cyclic],
    ["%d %i", Symbol("s"), Symbol("s")], [1, "%s", 2],
];

it("writes a console call's values as node writes them on one line", () => {
    const differing = calls.map(values => [formatLine(values), node(values)]).filter(([ours, theirs]) => ours !== theirs);
    expect(differing).toEqual([]);
});

it("never throws where node writes something, writing what it can", () => {
    const throwing: unknown = Object.create({ get constructor() { throw new Error("getter"); } });
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    const cases: readonly (readonly unknown[])[] = [["%s", throwing], [throwing], [revocable.proxy], [{ proxy: revocable.proxy }], ["%j", cyclic], ["%d", Symbol("s")]];
    for (const values of cases) expect([formatLine(values)]).toEqual([node(values)]);
    // Node itself throws for a value whose valueOf throws; the guide writes it as no number.
    expect(formatLine(["%d", { valueOf: () => { throw new Error("v"); } }])).toBe("NaN");
});

it("writes a promise, whose state a browser can't read, as unknown", () => {
    expect(formatLine([Promise.resolve(1)])).toBe("Promise { <state unknown> }");
});

it("draws a table as node's console.table does", () => {
    let out = "";
    const stream = new Writable({ write: (chunk: unknown, _encoding, done) => { out += String(chunk); done(); } });
    const console = new Console({ stdout: stream, stderr: stream, inspectOptions: { breakLength: Infinity, compact: true } });
    const tables: readonly (readonly [unknown, readonly string[] | undefined])[] = [
        [[{ a: 1, b: "Y" }, { a: 22, c: true }], undefined], [[[1, 2], [3]], undefined], [{ x: { v: 1 }, y: { v: 2 } }, undefined], [[1, "s"], undefined],
        [[{ a: 1, b: 2 }], ["a"]], [5, undefined], [[{ a: 1 }, 2], undefined],
    ];
    for (const [data, only] of tables) {
        out = "";
        console.table(data, only === undefined ? undefined : [...only]);
        expect(formatTable(data, only)).toBe(out.replace(/\n$/, ""));
    }
});
