// © 2026 Adobe. MIT License. See /LICENSE for details.
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { LitElement, html } from "lit";
import type { Observe } from "@adobe/data/observe";
import { attachDecorator } from "../attach-decorator.js";
import { withHooks } from "../with-hooks.js";
import { useObservable } from "../use-observable.js";
import { useState } from "../use-state.js";
import { useConnected } from "../use-connected.js";
import { useEffect } from "../use-effect.js";

/**
 * Real-DOM regression tests for the two-slot hook lifecycle:
 *
 *  - Value/subscription slots (useState, useObservable) SURVIVE a DOM move and
 *    are finalized only on a genuine unmount (deferred `isConnected` re-check).
 *  - Connectedness edges (useConnected) fire SYNCHRONOUSLY on every raw
 *    connect/disconnect edge — including a move — so listener/portal/drag setup
 *    tears down and re-attaches deterministically, with no deferral.
 *
 * These pin the contract that neither the 0.10.11 nuke-on-disconnect nor the
 * 0.10.14 defer-everything controller could satisfy simultaneously.
 */

const flushMicrotasks = (): Promise<void> => new Promise(resolve => queueMicrotask(resolve));

/** An Observe whose subscribe/unsubscribe churn the test can inspect. */
function createTrackedObservable(initial = 0): {
    observable: Observe<number>;
    subscriberCount: () => number;
    totalSubscribes: () => number;
    totalUnsubscribes: () => number;
} {
    const subscribers = new Set<(value: number) => void>();
    let subscribes = 0;
    let unsubscribes = 0;
    const observable: Observe<number> = observer => {
        subscribes++;
        subscribers.add(observer);
        observer(initial);
        return () => {
            unsubscribes++;
            subscribers.delete(observer);
        };
    };
    return {
        observable,
        subscriberCount: () => subscribers.size,
        totalSubscribes: () => subscribes,
        totalUnsubscribes: () => unsubscribes,
    };
}

// Module-scoped probes the element writes into, so a test can read edge/render
// history without reaching into the element instance.
let connectEdges: string[] = [];
let disconnectEdges: string[] = [];
let openResources = 0;
let effectSetups = 0;
let effectCleanups = 0;
let renderCount = 0;
let observableUnderTest: Observe<number>;

class LifecycleProbeElement extends LitElement {
    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }
    render() {
        renderCount++;
        // Edge primitive: must fire synchronously on every connect/disconnect edge,
        // and open exactly one resource per connect (balanced by its teardown).
        useConnected(() => {
            connectEdges.push("connect");
            openResources++;
            return () => {
                disconnectEdges.push("disconnect");
                openResources--;
            };
        });
        // Plain effect slot: React-parity — cleanup on finalization/dep-change,
        // never on a bare disconnect (so it survives a move too).
        useEffect(() => {
            effectSetups++;
            return () => {
                effectCleanups++;
            };
        }, []);
        // Value slot: must survive a move (retain its number across re-parenting).
        const [n] = useState(() => 41);
        // Subscription slot: must survive a move (no unsubscribe/re-subscribe).
        const value = useObservable(observableUnderTest);
        return html`<span>${n}:${value ?? ""}</span>`;
    }
}
customElements.define("lifecycle-probe-element", LifecycleProbeElement);

function resetProbes(obs: Observe<number>): void {
    connectEdges = [];
    disconnectEdges = [];
    openResources = 0;
    effectSetups = 0;
    effectCleanups = 0;
    renderCount = 0;
    observableUnderTest = obs;
}

describe("two-slot hook lifecycle — real DOM", () => {
    it("useConnected fires its disconnect edge SYNCHRONOUSLY on a genuine unmount", async () => {
        const { observable } = createTrackedObservable();
        resetProbes(observable);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(connectEdges).toEqual(["connect"]);
        expect(disconnectEdges).toEqual([]);

        el.remove();
        // The edge is synchronous: no microtask flush before this assertion.
        expect(disconnectEdges).toEqual(["disconnect"]);
    });

    it("useConnected runs setup ONCE across ordinary re-renders — no per-render leak", async () => {
        const { observable } = createTrackedObservable();
        resetProbes(observable);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(connectEdges).toEqual(["connect"]);
        expect(openResources).toBe(1);

        // Ordinary re-renders (no connect/disconnect edge) re-run the hook body but
        // must NOT re-invoke setup — the teardown handle persists across renders.
        el.requestUpdate();
        await el.updateComplete;
        el.requestUpdate();
        await el.updateComplete;
        expect(connectEdges).toEqual(["connect"]);
        expect(openResources).toBe(1);

        // Unmount tears down exactly the one open resource — nothing leaked.
        el.remove();
        expect(disconnectEdges).toEqual(["disconnect"]);
        expect(openResources).toBe(0);
    });

    it("useConnected churns disconnect→connect SYNCHRONOUSLY on a MOVE (re-parent)", async () => {
        const { observable } = createTrackedObservable();
        resetProbes(observable);
        const parentA = document.createElement("div");
        const parentB = document.createElement("div");
        document.body.append(parentA, parentB);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        parentA.appendChild(el);
        await el.updateComplete;
        expect(connectEdges).toEqual(["connect"]);

        // MOVE: disconnectedCallback then connectedCallback fire synchronously.
        parentB.appendChild(el);
        expect(el.isConnected).toBe(true);
        // The edge primitive tore down and re-attached, synchronously and in order.
        expect(disconnectEdges).toEqual(["disconnect"]);
        expect(connectEdges).toEqual(["connect", "connect"]);
    });

    it("value + subscription slots SURVIVE a MOVE (state kept, no re-subscribe, no forced render)", async () => {
        const { observable, subscriberCount, totalSubscribes, totalUnsubscribes } = createTrackedObservable();
        resetProbes(observable);
        const parentA = document.createElement("div");
        const parentB = document.createElement("div");
        document.body.append(parentA, parentB);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        parentA.appendChild(el);
        await el.updateComplete;
        expect(totalSubscribes()).toBe(1);
        const rendersBeforeMove = renderCount;

        parentB.appendChild(el);
        await flushMicrotasks();
        await el.updateComplete;

        // Subscription untouched; useState value preserved; no re-render forced.
        expect(subscriberCount()).toBe(1);
        expect(totalSubscribes()).toBe(1);
        expect(totalUnsubscribes()).toBe(0);
        expect(renderCount).toBe(rendersBeforeMove);
    });

    it("finalizes on a genuine unmount — subscription disposed, no leak", async () => {
        const { observable, subscriberCount, totalUnsubscribes } = createTrackedObservable();
        resetProbes(observable);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(subscriberCount()).toBe(1);

        el.remove();
        await flushMicrotasks();

        expect(subscriberCount()).toBe(0);
        expect(totalUnsubscribes()).toBe(1);
    });

    it("a genuine unmount→remount (across a task) re-initializes and re-subscribes the slots", async () => {
        const { observable, subscriberCount, totalSubscribes } = createTrackedObservable();
        resetProbes(observable);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(totalSubscribes()).toBe(1);

        // Unmount, let finalization run (task boundary), then remount.
        el.remove();
        await flushMicrotasks();
        expect(subscriberCount()).toBe(0);

        document.body.appendChild(el);
        await el.updateComplete;

        // Slots were finalized while detached, so the remount re-subscribed.
        expect(subscriberCount()).toBe(1);
        expect(totalSubscribes()).toBe(2);
        // And the edge primitive reconnected.
        expect(connectEdges.filter(e => e === "connect").length).toBe(2);
    });

    it("a genuine unmount→remount to a DIFFERENT parent (across a task) re-initializes and re-subscribes", async () => {
        const { observable, subscriberCount, totalSubscribes } = createTrackedObservable();
        resetProbes(observable);
        const parentA = document.createElement("div");
        const parentB = document.createElement("div");
        document.body.append(parentA, parentB);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        parentA.appendChild(el);
        await el.updateComplete;
        expect(totalSubscribes()).toBe(1);

        // Unmount from A, let finalization run, then remount under a DIFFERENT parent.
        // The finalization gate reads `isConnected` (not "did it reconnect to the same
        // node"), so a remount anywhere is handled uniformly.
        el.remove();
        await flushMicrotasks();
        expect(subscriberCount()).toBe(0);

        parentB.appendChild(el);
        await el.updateComplete;

        expect(subscriberCount()).toBe(1);
        expect(totalSubscribes()).toBe(2);
        expect(connectEdges.filter(e => e === "connect").length).toBe(2);
    });

    it("plain useEffect cleanup does NOT run on a MOVE, and runs (deferred) on a genuine unmount", async () => {
        const { observable } = createTrackedObservable();
        resetProbes(observable);
        const parentA = document.createElement("div");
        const parentB = document.createElement("div");
        document.body.append(parentA, parentB);
        const el = document.createElement("lifecycle-probe-element") as LifecycleProbeElement;
        parentA.appendChild(el);
        await el.updateComplete;
        expect(effectSetups).toBe(1);
        expect(effectCleanups).toBe(0);

        // MOVE: the effect slot survives untouched — no cleanup, no re-setup.
        parentB.appendChild(el);
        await flushMicrotasks();
        await el.updateComplete;
        expect(effectSetups).toBe(1);
        expect(effectCleanups).toBe(0);

        // UNMOUNT: cleanup runs on the finalization microtask, not synchronously.
        el.remove();
        expect(effectCleanups).toBe(0);
        await flushMicrotasks();
        expect(effectCleanups).toBe(1);
    });
});
