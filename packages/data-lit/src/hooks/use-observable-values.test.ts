// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Observe } from "@adobe/data/observe";
import { useObservableValues } from "./use-observable-values.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

describe("useObservableValues", () => {
    it("returns undefined until every source has emitted, then all latest values", () => {
        const host = createHost();
        const [name, setName] = Observe.createEvent<string>();
        const [count, setCount] = Observe.createEvent<number>();
        const factory = () => ({ name, count });

        expect(render(host, () => useObservableValues(factory))).toBeUndefined();
        setName("a");
        expect(render(host, () => useObservableValues(factory))).toBeUndefined();
        setCount(1);
        expect(render(host, () => useObservableValues(factory))).toEqual({ name: "a", count: 1 });
        setName("b");
        expect(render(host, () => useObservableValues(factory))).toEqual({ name: "b", count: 1 });
        unmount(host);
    });

    it("combines sources that emit synchronously in the first render", () => {
        const host = createHost();
        const factory = () => ({ a: Observe.fromConstant(1), b: Observe.fromConstant("x") });
        expect(render(host, () => useObservableValues(factory))).toEqual({ a: 1, b: "x" });
        unmount(host);
    });

    it("calls the factory again only when dependencies change", () => {
        const host = createHost();
        const factory = vi.fn(() => ({ a: Observe.fromConstant(1) }));
        render(host, () => useObservableValues(factory, [1]));
        render(host, () => useObservableValues(factory, [1]));
        render(host, () => useObservableValues(factory, [2]));
        expect(factory).toHaveBeenCalledTimes(2);
        unmount(host);
    });

    it("unsubscribes from every source on unmount", () => {
        const host = createHost();
        const unsubscribed = vi.fn();
        const tracked = <T,>(value: T): Observe<T> => observer => {
            observer(value);
            return unsubscribed;
        };
        render(host, () => useObservableValues(() => ({ a: tracked(1), b: tracked(2) })));
        unmount(host);
        expect(unsubscribed).toHaveBeenCalledTimes(2);
    });
});
