// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { useDebounce } from "./use-debounce.js";
import { createHost, render, unmount } from "./test-host.test-utils.js";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useDebounce", () => {
    it("returns the initial value immediately", () => {
        const host = createHost();
        expect(render(host, () => useDebounce("a", 100))).toBe("a");
    });

    it("returns a new value only after the delay", () => {
        const host = createHost();
        render(host, () => useDebounce("a", 100));
        render(host, () => useDebounce("b", 100));

        vi.advanceTimersByTime(99);
        expect(render(host, () => useDebounce("b", 100))).toBe("a");
        vi.advanceTimersByTime(1);
        expect(render(host, () => useDebounce("b", 100))).toBe("b");
        expect(host.requestUpdate).toHaveBeenCalledTimes(1);
        unmount(host);
    });

    it("restarts the delay on each change and keeps only the last value", () => {
        const host = createHost();
        render(host, () => useDebounce("a", 100));
        render(host, () => useDebounce("b", 100));
        vi.advanceTimersByTime(60);
        render(host, () => useDebounce("c", 100));
        vi.advanceTimersByTime(60);
        expect(render(host, () => useDebounce("c", 100))).toBe("a");
        vi.advanceTimersByTime(40);
        expect(render(host, () => useDebounce("c", 100))).toBe("c");
        unmount(host);
    });

    it("restarts the delay when the delay changes", () => {
        const host = createHost();
        render(host, () => useDebounce("a", 100));
        render(host, () => useDebounce("b", 100));
        vi.advanceTimersByTime(50);
        render(host, () => useDebounce("b", 200));
        vi.advanceTimersByTime(150);
        expect(render(host, () => useDebounce("b", 200))).toBe("a");
        vi.advanceTimersByTime(50);
        expect(render(host, () => useDebounce("b", 200))).toBe("b");
        unmount(host);
    });

    it("cancels the pending update on unmount", () => {
        const host = createHost();
        render(host, () => useDebounce("a", 100));
        render(host, () => useDebounce("b", 100));
        unmount(host);
        vi.advanceTimersByTime(100);
        expect(host.requestUpdate).not.toHaveBeenCalled();
    });
});
