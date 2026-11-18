// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import { record } from "../test/dom/elements/index.js";
import { define } from "../view/index.js";
import { VirtualList } from "./index.js";

define({ "virtual-list": VirtualList });

afterEach(() => {
    document.body.replaceChildren();
});

/** A list 220px tall, 5 rows of 44, of `count` items, its rows focusable divs showing their key. */
const createList = (count: number): VirtualList<string, HTMLElement> => {
    const list = new VirtualList<string, HTMLElement>();
    list.style.height = "220px";
    list.create = () => {
        const row = document.createElement("div");
        row.tabIndex = 0;
        return row;
    };
    list.count = count;
    document.body.append(list);
    return list;
};

/** What `bind` was called with, and a bind that writes the key as the row's text. */
const binder = () => {
    const bound: string[] = [];
    const bind = (element: HTMLElement, key: string): void => {
        element.textContent = key;
        bound.push(key);
    };
    return { bound, bind };
};

const keysOf = (from: number, to: number): string[] => Array.from({ length: to - from }, (_, i) => `k${from + i}`);

/** Each row's key and the index it's placed at, by its offset, in item order. */
const placed = (list: VirtualList<string, HTMLElement>): string[] => [...list.children]
    .filter(element => element instanceof HTMLElement)
    .map(element => ({ key: element.textContent ?? "", index: list.indexOf(element), top: element.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop }))
    .sort((a, b) => a.index - b.index)
    .map(({ key, index, top }) => `${key}@${index}:${Math.round(top)}`);

/** Resolves once `list` has been resized and scrolled into the range it now asks for. */
const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

describe("virtual-list", () => {
    it("asks for the rows in view and half a screen more on either side", async () => {
        const list = createList(1000);
        await frame();
        const over = innerHeight / 2;
        expect(list.range).toEqual({ start: 0, end: Math.ceil((220 + over) / 44) });
        list.scrollTop = 2200;
        await frame();
        expect(list.range).toEqual({ start: Math.floor((2200 - over) / 44), end: Math.ceil((2200 + 220 + over) / 44) });
    });

    it("dispatches virtual-range only once the view nears the edge of its range", async () => {
        const list = createList(1000);
        await frame();
        const seen = record(document.body, "virtual-range");
        list.scrollTop = 44;
        await frame();
        expect(seen).toEqual([]);
        list.scrollTop = 4400;
        await frame();
        expect(seen).toEqual([{ type: "virtual-range", detail: list.range, target: list }]);
    });

    it("places each item's row at its index, and scrolls as far as its count", () => {
        const list = createList(100);
        const { bind } = binder();
        list.render(0, keysOf(0, 3), bind);
        expect(placed(list)).toEqual(["k0@0:0", "k1@1:44", "k2@2:88"]);
        expect(list.scrollHeight).toBe(4400);
        expect(list.elementOf("k1")).toBe(list.elementAt(1));
        expect(list.elementOf("k9")).toBe(null);
        expect(list.elementAt(5)).toBe(null);
    });

    it("binds only the rows given a new key, reusing those whose keys left, and touches no other", () => {
        const list = createList(100);
        const { bound, bind } = binder();
        list.render(0, keysOf(0, 10), bind);
        const kept = keysOf(2, 10).map(key => list.elementOf(key));
        const reused = [list.elementOf("k0"), list.elementOf("k1")];
        bound.length = 0;
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(delivered => records.push(...delivered));
        observer.observe(list, { childList: true, subtree: true, attributes: true, characterData: true });
        list.render(2, keysOf(2, 12), bind);
        records.push(...observer.takeRecords());
        observer.disconnect();
        expect(bound).toEqual(["k10", "k11"]);
        expect(keysOf(2, 10).map(key => list.elementOf(key))).toEqual(kept);
        expect(new Set([list.elementOf("k10"), list.elementOf("k11")])).toEqual(new Set(reused));
        expect(list.children).toHaveLength(10);
        // The two rows reused: their text and their place.
        expect(new Set(records.map(record => record.target instanceof Text ? record.target.parentNode : record.target))).toEqual(new Set(reused));
        expect(placed(list).slice(-2)).toEqual(["k10@10:440", "k11@11:484"]);
    });

    it("does nothing when rendering what it shows", () => {
        const list = createList(100);
        const { bound, bind } = binder();
        list.render(0, keysOf(0, 5), bind);
        bound.length = 0;
        const records: MutationRecord[] = [];
        const observer = new MutationObserver(delivered => records.push(...delivered));
        observer.observe(list, { childList: true, subtree: true, attributes: true, characterData: true });
        list.render(0, keysOf(0, 5), bind);
        records.push(...observer.takeRecords());
        observer.disconnect();
        expect([bound, records]).toEqual([[], []]);
    });

    it("moves rows whose items moved, and removes those it no longer needs", () => {
        const list = createList(100);
        const { bound, bind } = binder();
        list.render(0, ["a", "b", "c"], bind);
        const [a, b, c] = ["a", "b", "c"].map(key => list.elementOf(key));
        list.render(0, ["c", "a"], bind);
        expect(bound).toEqual(["a", "b", "c"]);
        expect(placed(list)).toEqual(["c@0:0", "a@1:44"]);
        expect([list.elementOf("c"), list.elementOf("a")]).toEqual([c, a]);
        expect(b?.isConnected).toBe(false);
        list.render(0, [], bind);
        expect(list.children).toHaveLength(0);
    });

    it("keeps the focused row where keep says its key is, and otherwise focuses the row at its place", () => {
        const list = createList(100);
        const { bind } = binder();
        list.render(0, keysOf(0, 5), bind);
        const focused = list.elementOf("k1");
        focused?.focus();
        list.render(10, keysOf(10, 15), bind, (_element, key) => key === "k1" ? 1 : -1);
        expect(list.elementOf("k1")).toBe(focused);
        expect(document.activeElement).toBe(focused);
        expect(list.indexOf(focused ?? list)).toBe(1);
        // Its key gone, the row at its place takes the focus.
        list.render(0, ["k0", "k2", "k3"], bind, () => -1);
        expect(list.elementOf("k1")).toBe(null);
        const next = list.elementAt(1);
        expect(next?.textContent).toBe("k2");
        expect(document.activeElement).toBe(next);
        list.render(0, ["k0"], bind);
        expect(document.activeElement).toBe(list.elementAt(0));
    });
});
