import { describe, it, expect, vi } from "vitest";
import type { Component } from "./component/component.js";
import { Component_stack } from "./component/stack.js";
import { useState } from "./use-state.js";

function createHost(): Component {
    return Object.assign(new EventTarget(), {
        isConnected: true,
        hookIndex: 0,
        hooks: [],
        updatedListeners: new Set<() => void>(),
        requestUpdate: vi.fn(),
    });
}

function render<T>(host: Component, callback: () => T): T {
    Component_stack.push(host);
    try {
        return callback();
    } finally {
        Component_stack.pop();
    }
}

describe("useState", () => {
    it("keeps the setter stable across renders and updates", () => {
        const host = createHost();
        const [, setValue] = render(host, () => useState(0));
        expect(render(host, () => useState(0))[1]).toBe(setValue);

        setValue(1);

        const [value, nextSetter] = render(host, () => useState(0));
        expect(value).toBe(1);
        expect(nextSetter).toBe(setValue);
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
    });

    it.each([0, NaN, null, undefined, "value", false, {}, []])(
        "does not request an update for an Object.is-equal value: %s",
        initial => {
            const host = createHost();
            const [, setValue] = render(host, () => useState(initial));

            setValue(initial);
            setValue(initial);

            expect(host.requestUpdate).not.toHaveBeenCalled();
        },
    );

    it("compares against the latest value before another render", () => {
        const host = createHost();
        const [, setValue] = render(host, () => useState(0));

        setValue(1);
        setValue(1);
        setValue(2);

        expect(host.requestUpdate).toHaveBeenCalledTimes(2);
        expect(render(host, () => useState(0))[0]).toBe(2);
    });

    it("distinguishes positive and negative zero", () => {
        const host = createHost();
        const [, setValue] = render(host, () => useState(0));

        setValue(-0);

        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
        expect(render(host, () => useState(0))[0]).toBe(-0);
    });

    it.each([null, undefined])("initializes a nullish value only once: %s", initial => {
        const host = createHost();
        const initialize = vi.fn(() => initial);

        render(host, () => useState(initialize));
        render(host, () => useState(initialize));

        expect(initialize).toHaveBeenCalledTimes(1);
    });

    it.each([null, undefined])("preserves a nullish update: %s", nextValue => {
        const host = createHost();
        const [, setValue] = render(host, () => useState<number | null | undefined>(1));

        setValue(nextValue);

        expect(render(host, () => useState(1))[0]).toBe(nextValue);
    });

    it("keeps state slots and hosts independent", () => {
        const host = createHost();
        const otherHost = createHost();
        const read = () => [useState(0), useState(10)] as const;
        const [first, second] = render(host, read);
        const [other] = render(otherHost, read);

        first[1](1);

        expect(render(host, read).map(([value]) => value)).toEqual([1, 10]);
        expect(render(otherHost, read).map(([value]) => value)).toEqual([0, 10]);
        expect(first[1]).not.toBe(second[1]);
        expect(first[1]).not.toBe(other[1]);
        expect(otherHost.requestUpdate).not.toHaveBeenCalled();
    });
});