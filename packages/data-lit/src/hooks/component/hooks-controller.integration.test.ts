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

/** An Observe whose live subscriber count and cumulative churn the test can inspect. */
function createTrackedObservable(): {
    observable: Observe<number>;
    emit: (value: number) => void;
    subscriberCount: () => number;
    totalSubscribes: () => number;
    totalUnsubscribes: () => number;
} {
    const subscribers = new Set<(value: number) => void>();
    let current = 0;
    let subscribes = 0;
    let unsubscribes = 0;
    const observable: Observe<number> = observer => {
        subscribes++;
        subscribers.add(observer);
        observer(current);
        return () => {
            unsubscribes++;
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
        totalSubscribes: () => subscribes,
        totalUnsubscribes: () => unsubscribes,
    };
}

/** Resolves after the current microtask checkpoint, so deferred teardown can run. */
const flushMicrotasks = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

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
        // Teardown is deferred one microtask (so a re-parent MOVE can cancel it —
        // see the move test below); a genuine unmount has no reconnect, so it runs.
        await flushMicrotasks();

        // Disconnect ran the effect cleanup: the subscription is gone.
        expect(subscriberCount()).toBe(0);

        // A later emit reaches no leaked subscriber, so the detached element is
        // never asked to update. Without the disposal fix, this would be >= 1.
        emit(99);
        expect(updatesAfterRemove).toBe(0);
    });

    it("does NOT tear down and rebuild subscriptions when the element is merely MOVED", async () => {
        const { observable, subscriberCount, totalSubscribes, totalUnsubscribes } = createTrackedObservable();

        const parentA = document.createElement("div");
        const parentB = document.createElement("div");
        document.body.appendChild(parentA);
        document.body.appendChild(parentB);

        const el = document.createElement("hook-probe-element") as HookProbeElement;
        el.observable = observable;
        parentA.appendChild(el);
        await el.updateComplete;
        expect(subscriberCount()).toBe(1);
        expect(totalSubscribes()).toBe(1);

        let updatesDuringMove = 0;
        const originalRequestUpdate = el.requestUpdate.bind(el);
        el.requestUpdate = (...args: Parameters<HookProbeElement["requestUpdate"]>) => {
            updatesDuringMove++;
            originalRequestUpdate(...args);
        };

        // MOVE: appendChild to another already-connected parent fires
        // disconnectedCallback then connectedCallback synchronously, in one task.
        parentB.appendChild(el);
        await flushMicrotasks();
        await el.updateComplete;

        // The element is still mounted and its subscription is intact...
        expect(el.isConnected).toBe(true);
        expect(subscriberCount()).toBe(1);
        // ...and, crucially, the move neither disposed nor re-created it. Before the
        // deferred-disposal fix, a move disposed and re-subscribed (2 subs / 1 unsub)
        // and forced an extra re-render — the source of the studio-page lag, churn,
        // and transient empty lists on project switch (FFP-111900).
        expect(totalUnsubscribes()).toBe(0);
        expect(totalSubscribes()).toBe(1);
        expect(updatesDuringMove).toBe(0);
    });
});
