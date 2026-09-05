// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { LitElement, html } from "lit";
import type { Observe } from "@adobe/data/observe";
import { attachDecorator } from "../attach-decorator.js";
import { withHooks } from "../with-hooks.js";
import { useObservable } from "../use-observable.js";

/**
 * Real-DOM regression test for the hook-disposal fix. Where the sibling
 * hooks-controller.test.ts drives a hand-rolled FakeHost, this mounts a genuine
 * LitElement in a happy-dom document, so it exercises the actual bug path:
 * `withHooks` installs the controller, `addController` fires `hostConnected`
 * synchronously during the real connect, and a real `useObservable` subscription
 * is torn down when the element leaves the DOM (instead of leaking and firing
 * `requestUpdate` on a detached element).
 */

/** An Observe whose live subscriber count the test can inspect. */
function createTrackedObservable(): {
    observable: Observe<number>;
    emit: (value: number) => void;
    subscriberCount: () => number;
} {
    const subscribers = new Set<(value: number) => void>();
    let current = 0;
    const observable: Observe<number> = observer => {
        subscribers.add(observer);
        observer(current);
        return () => {
            subscribers.delete(observer);
        };
    };
    return {
        observable,
        emit: value => {
            current = value;
            for (const observer of subscribers) observer(value);
        },
        subscriberCount: () => subscribers.size,
    };
}

class HookProbeElement extends LitElement {
    observable!: Observe<number>;
    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }
    render() {
        const value = useObservable(this.observable);
        return html`<span>${value ?? ""}</span>`;
    }
}
customElements.define("hook-probe-element", HookProbeElement);

describe("hook disposal on real DOM disconnect", () => {
    it("tears down a useObservable subscription and stops requestUpdate when the element is removed", async () => {
        const { observable, emit, subscriberCount } = createTrackedObservable();

        const el = document.createElement("hook-probe-element") as HookProbeElement;
        el.observable = observable;
        document.body.appendChild(el);
        await el.updateComplete;

        // Mounted: the render subscribed exactly once.
        expect(subscriberCount()).toBe(1);

        // Track any requestUpdate that fires AFTER the element is removed.
        let updatesAfterRemove = 0;
        const originalRequestUpdate = el.requestUpdate.bind(el);
        el.requestUpdate = (...args: Parameters<HookProbeElement["requestUpdate"]>) => {
            updatesAfterRemove++;
            originalRequestUpdate(...args);
        };

        el.remove();

        // Disconnect ran the effect cleanup: the subscription is gone.
        expect(subscriberCount()).toBe(0);

        // A later emit reaches no leaked subscriber, so the detached element is
        // never asked to update. Without the disposal fix, this would be >= 1.
        emit(99);
        expect(updatesAfterRemove).toBe(0);
    });
});
