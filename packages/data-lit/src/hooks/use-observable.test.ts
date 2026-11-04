// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Observe } from "@adobe/data/observe";
import { useObservable } from "./use-observable.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

function source<T>() {
    const [observe, notify] = Observe.createEvent<T>();
    const subscribe = vi.fn(observe);
    return { observable: subscribe as Observe<T>, notify, subscribe };
}

describe("useObservable", () => {
    it("returns undefined until the source emits, then the latest value", () => {
        const host = createHost();
        const { observable, notify } = source<number>();
        expect(render(host, () => useObservable(observable))).toBeUndefined();
        notify(1);
        notify(2);
        expect(render(host, () => useObservable(observable))).toBe(2);
    });

    it("returns a value emitted synchronously on subscribe in the same render", () => {
        const host = createHost();
        const observable: Observe<number> = observer => { observer(7); return () => {}; };
        expect(render(host, () => useObservable(observable))).toBe(7);
    });

    it("requests a render for every notification, including a repeated reference", () => {
        const host = createHost();
        const { observable, notify } = source<{ count: number }>();
        const value = { count: 0 };
        render(host, () => useObservable(observable));
        notify(value);
        value.count = 1;
        notify(value);
        expect(host.requestUpdate).toHaveBeenCalledTimes(2);
        expect(render(host, () => useObservable(observable))).toBe(value);
    });

    it("subscribes once per source and resubscribes when the source changes", () => {
        const host = createHost();
        const a = source<number>();
        const b = source<number>();
        render(host, () => useObservable(a.observable));
        render(host, () => useObservable(a.observable));
        render(host, () => useObservable(b.observable));
        a.notify(1);
        expect(a.subscribe).toHaveBeenCalledTimes(1);
        expect(b.subscribe).toHaveBeenCalledTimes(1);
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });

    it("unsubscribes on unmount", () => {
        const host = createHost();
        const { observable, notify } = source<number>();
        render(host, () => useObservable(observable));
        unmount(host);
        notify(1);
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });
});
