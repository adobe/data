// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LitElement, html } from "lit";
import { attachDecorator } from "./attach-decorator.js";
import { withHooks } from "./with-hooks.js";
import { useUpdated, type UpdateEventHost } from "./use-updated.js";
import { createHost, render } from "./test-host.test-utils.js";

class UpdatedProbe extends LitElement {
    listeners: (() => void)[] = [];
    dependency = 0;
    originalUpdated = vi.fn();

    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }

    override updated() {
        this.originalUpdated();
    }

    render() {
        for (const listener of this.listeners) {
            useUpdated(listener, [this.dependency]);
        }
        return html``;
    }
}
customElements.define("use-updated-probe", UpdatedProbe);

async function mount(...listeners: (() => void)[]) {
    const element = document.createElement("use-updated-probe") as UpdatedProbe;
    element.listeners = listeners;
    document.body.append(element);
    await element.updateComplete;
    return element;
}

afterEach(async () => {
    document.body.replaceChildren();
    await Promise.resolve();
});

describe("useUpdated", () => {
    it("calls the listener after every update, after the element's own updated", async () => {
        const calls: string[] = [];
        const element = await mount(() => calls.push("listener"));
        expect(calls).toEqual(["listener"]);
        element.originalUpdated.mockImplementation(() => calls.push("updated"));
        calls.length = 0;

        element.requestUpdate();
        await element.updateComplete;
        expect(calls).toEqual(["updated", "listener"]);
    });

    it("calls multiple listeners in registration order through one wrapper", async () => {
        const calls: string[] = [];
        const element = await mount(() => calls.push("a"), () => calls.push("b"));
        calls.length = 0;
        element.requestUpdate();
        await element.updateComplete;
        expect(calls).toEqual(["a", "b"]);
        expect(element.originalUpdated).toHaveBeenCalledTimes(2);
    });

    it("replaces the listener when dependencies change", async () => {
        const first = vi.fn();
        const second = vi.fn();
        const element = await mount(first);
        element.listeners = [second];
        element.dependency = 1;
        element.requestUpdate();
        await element.updateComplete;
        first.mockClear();
        second.mockClear();

        element.requestUpdate();
        await element.updateComplete;
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("removes the listener on unmount", async () => {
        const element = await mount(() => {});
        const listeners = (element as unknown as UpdateEventHost).updateListeners;
        expect(listeners.size).toBe(1);
        element.remove();
        await Promise.resolve();
        expect(listeners.size).toBe(0);
    });

    it("throws for a host without an updated method", () => {
        expect(() => render(createHost(), () => useUpdated(() => {}))).toThrow("does not have an updated method");
    });
});
