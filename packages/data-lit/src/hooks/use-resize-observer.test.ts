// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { LitElement, html } from "lit";
import { attachDecorator } from "./attach-decorator.js";
import { withHooks } from "./with-hooks.js";
import { useMemo } from "./use-memo.js";
import { useResizeObserver } from "./use-resize-observer.js";
import { useState } from "./use-state.js";

class ResizeProbeElement extends LitElement {
    renders = 0;
    offset = 0;
    widths: number[] = [];
    calculateCallback = vi.fn((setWidth: (value: number) => void) => setWidth);

    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }

    render() {
        this.renders++;
        const [width, setWidth] = useState(0);
        const memoizedSetter = useMemo(() => this.calculateCallback(setWidth), [setWidth]);
        const offset = this.offset;
        useResizeObserver(info => {
            this.widths.push(info.width + offset);
            memoizedSetter(Math.floor(info.width + offset));
        });
        return html`<span>${width}</span>`;
    }
}
customElements.define("resize-state-probe", ResizeProbeElement);

function mockResizeObserver() {
    const observers: { emit: (width: number) => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal("ResizeObserver", class {
        observe = vi.fn();
        disconnect = vi.fn();

        constructor(callback: ResizeObserverCallback) {
            observers.push({
                emit: width => callback([
                    { contentRect: { width, height: 20 } } as ResizeObserverEntry,
                ], this as unknown as ResizeObserver),
                observe: this.observe,
                disconnect: this.disconnect,
            });
        }
    });
    return observers;
}

afterEach(async () => {
    document.body.replaceChildren();
    await new Promise<void>(resolve => queueMicrotask(resolve));
    vi.unstubAllGlobals();
});

describe("useResizeObserver with state", () => {
    it("keeps one observer, uses the latest inline callback, and skips unchanged widths", async () => {
        const observers = mockResizeObserver();
        const element = document.createElement("resize-state-probe") as ResizeProbeElement;
        document.body.appendChild(element);
        await element.updateComplete;
        const observer = observers[0];
        expect(observer.observe).toHaveBeenCalledExactlyOnceWith(element);

        observer.emit(100.2);
        await element.updateComplete;
        expect(element.shadowRoot?.textContent).toBe("100");
        expect(element.renders).toBe(2);
        expect(observers).toHaveLength(1);
        expect(observer.disconnect).not.toHaveBeenCalled();
        expect(element.calculateCallback).toHaveBeenCalledTimes(1);

        const requestUpdate = vi.spyOn(element, "requestUpdate");
        observer.emit(100.8);
        await element.updateComplete;
        expect(requestUpdate).not.toHaveBeenCalled();
        expect(element.renders).toBe(2);

        element.offset = 10;
        element.requestUpdate();
        await element.updateComplete;
        observer.emit(200);
        await element.updateComplete;
        expect(element.widths).toEqual([100.2, 100.8, 210]);
        expect(element.shadowRoot?.textContent).toBe("210");
        expect(observers).toHaveLength(1);
        expect(observer.disconnect).not.toHaveBeenCalled();
        expect(element.calculateCallback).toHaveBeenCalledTimes(1);
    });

    it("disconnects on unmount and creates fresh state and observer on remount", async () => {
        const observers = mockResizeObserver();
        const element = document.createElement("resize-state-probe") as ResizeProbeElement;
        document.body.appendChild(element);
        await element.updateComplete;
        observers[0].emit(100);
        await element.updateComplete;

        element.remove();
        await new Promise<void>(resolve => queueMicrotask(resolve));
        expect(observers[0].disconnect).toHaveBeenCalledTimes(1);

        document.body.appendChild(element);
        await element.updateComplete;
        expect(element.shadowRoot?.textContent).toBe("0");
        expect(observers).toHaveLength(2);
        expect(observers[1].observe).toHaveBeenCalledExactlyOnceWith(element);
        expect(element.calculateCallback).toHaveBeenCalledTimes(2);
    });
});