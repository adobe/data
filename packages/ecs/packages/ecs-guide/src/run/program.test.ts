// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { captureConsole, describeError, entryOf, fromDevServer, isTypeTest } from "./program.js";
import { runMessageOf, type Entry, type RunMessage } from "./protocol.js";

const methods = ["log", "info", "warn", "error", "debug", "dir", "table", "assert", "trace", "count", "countReset"];

/** A console of the frame's kind whose methods write nothing, captured, and what it took, a turn at a time. */
const capture = () => {
    const console: Console = Object.assign(Object.create(globalThis.console), Object.fromEntries(methods.map(name => [name, () => {}])));
    const listeners = new Map<string, (event: Event) => void>();
    const entries: Entry[] = [];
    captureConsole(taken => void entries.push(...taken), { console, addEventListener: (type, listener) => void listeners.set(type, listener) });
    return { console, entries, listeners, turn: () => new Promise<void>(resolve => queueMicrotask(resolve)) };
};

it("takes a console call as a line at its level, a program's own `[vite]` line too", async () => {
    const { console, entries, turn } = capture();
    console.warn("moved", [1, 0, 0]);
    console.log("[vite] isn't the dev server's when a program writes it");
    await turn();
    expect(entries).toEqual([{ level: "warn", text: "moved [ 1, 0, 0 ]" }, { level: "log", text: "[vite] isn't the dev server's when a program writes it" }]);
    expect(entryOf("info", ["%d", 2])).toEqual({ level: "info", text: "2" });
});

it("knows the dev server's lines by where they come from, not by what they say", () => {
    expect(fromDevServer("Error\n    at console.debug (http://localhost:5173/@vite/client:802:9)")).toBe(true);
    expect(fromDevServer("Error\n    at main (http://localhost:5173/node_modules/@adobe/ecs/src/guide/03-systems.ts:60:13)")).toBe(false);
});

it("takes dir, table, assert, trace and count as node's console writes them", async () => {
    const { console, entries, turn } = capture();
    console.dir({ a: { b: { c: { d: 1 } } } });
    console.table([{ a: 1 }]);
    console.assert(true, "unseen");
    console.assert(false);
    console.assert(false, "msg %d", 3);
    console.assert(false, { a: 1 });
    console.count();
    console.count();
    console.count("x");
    console.countReset();
    console.count();
    console.trace("here %s", "t");
    await turn();
    const texts = entries.map(entry => entry.text);
    expect(texts.slice(0, 9)).toEqual([
        "{ a: { b: { c: [Object] } } }", "┌─────────┬───┐\n│ (index) │ a │\n├─────────┼───┤\n│ 0       │ 1 │\n└─────────┴───┘",
        "Assertion failed", "Assertion failed: msg 3", "Assertion failed { a: 1 }", "default: 1", "default: 2", "x: 1", "default: 1",
    ]);
    expect(entries[2]?.level).toBe("error");
    expect(texts[9]).toMatch(/^Trace: here t\n\s+at /);
});

it("takes errors nothing caught, and rejections nothing handled, as uncaught", async () => {
    const { entries, listeners, turn } = capture();
    listeners.get("error")?.(Object.assign(new Event("error"), { error: new TypeError("broken") }));
    listeners.get("unhandledrejection")?.(Object.assign(new Event("unhandledrejection"), { reason: new Error("refused") }));
    await turn();
    expect(entries).toEqual([{ level: "uncaught", text: "Uncaught TypeError: broken" }, { level: "uncaught", text: "Uncaught (in promise) Error: refused" }]);
});

it("knows a chapter's type test, which runs nothing, from its programs, which must export main", () => {
    expect([isTypeTest("11-traits.type-test.ts"), isTypeTest("11-traits.ts")]).toEqual([true, false]);
});

it("describes an error by its name and message, and anything else thrown as the console writes it", () => {
    expect(describeError(new TypeError("broken"))).toBe("TypeError: broken");
    expect(describeError(3)).toBe("3");
    expect(describeError("text")).toBe("text");
});

it("reads back what a frame posts, and ignores messages that aren't a run's", () => {
    const messages: readonly RunMessage[] = [
        { kind: "logs", run: 1, entries: [{ level: "log", text: "a" }, { level: "uncaught", text: "Uncaught Error: b" }] },
        { kind: "rendered", run: 1 }, { kind: "finished", run: 1 }, { kind: "failed", run: 2 },
    ];
    for (const message of messages) expect(runMessageOf(JSON.parse(JSON.stringify(message)))).toEqual(message);
    for (const data of [null, "logs", { kind: "logs", run: "1", entries: [] }, { kind: "logs", run: 1, entries: [{ level: "shout", text: "" }] }, { kind: "other", run: 1 }]) {
        expect(runMessageOf(data)).toBeNull();
    }
});
