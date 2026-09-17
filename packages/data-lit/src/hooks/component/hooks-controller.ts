// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { Component } from "./component.js";

/**
 * Per-host flag marking that the hook-lifecycle controller is already
 * installed, so repeated renders (and double-wrapped `render` methods) do
 * not register duplicate controllers.
 */
const HOOKS_CONTROLLER = Symbol("data-lit.hooksController");

type ReactiveHost = Component & ReactiveControllerHost & { [HOOKS_CONTROLLER]?: boolean };

function isReactiveHost(host: Component): host is ReactiveHost {
    return "addController" in host && typeof host.addController === "function";
}

/**
 * Finalize a host: dispose every hook slot's cleanup and clear the slots so the
 * next render re-initializes from scratch. Only slots that expose a `dispose`
 * function (effects, subscriptions) are torn down; value slots (state, memo,
 * ref) are simply dropped.
 */
function finalizeHooks(host: Component): void {
    const { hooks } = host;
    if (hooks) {
        for (const hook of hooks) {
            (hook as { dispose?: () => void } | undefined)?.dispose?.();
        }
    }
    host.hooks = [];
    host.hookIndex = 0;
}

/**
 * Give a hook host a correct lifecycle by separating two concerns that the DOM
 * connect/disconnect edge conflates.
 *
 * A hook host has two kinds of slot:
 *
 *  - **Value / subscription slots** — {@link useState}, {@link useRef},
 *    {@link useMemo}, and effect-backed subscriptions ({@link useEffect},
 *    {@link useObservable}, {@link useObservableValues}). These are *stateful*
 *    and *expensive to rebuild*. They must SURVIVE a DOM move and be finalized
 *    only when the element is genuinely gone.
 *  - **Connectedness edges** — {@link useConnected}, the primitive for window /
 *    document listeners, portals, drag sessions: things that track raw DOM
 *    connectedness and must attach/detach *synchronously* on every edge.
 *
 * The trap: the DOM fires `disconnectedCallback` then `connectedCallback`
 * **synchronously, in the same task,** whenever a connected element is merely
 * *moved* (a Lit `repeat` reorder, a list re-parenting, a drag-reorder). There
 * is no synchronous signal that distinguishes a move from a genuine unmount, so
 * this controller does not try to classify the edge. Instead it handles each
 * concern with the policy that concern actually wants:
 *
 *  - **Edges fire synchronously, every time.** `hostConnected` /
 *    `hostDisconnected` dispatch the `"connected"` / `"disconnected"` events
 *    inline on every raw edge, so {@link useConnected} tears down and re-attaches
 *    deterministically — including across a move (cheap, and exactly what a
 *    listener/portal wants).
 *  - **Slot finalization is deferred behind an `isConnected` re-check.** A
 *    disconnect schedules a microtask; when it runs it disposes the slots only
 *    if the host is STILL disconnected. A move has reconnected by then, so its
 *    subscription/value slots survive untouched — no re-subscribe, no state
 *    reset. A genuine unmount is still disconnected, so it finalizes, preserving
 *    the unmount-leak fix.
 *  - **Every RE-connect forces one `requestUpdate`.** The DOM does not re-render
 *    an element on a bare re-parent, so without this an element whose render
 *    reads mutable non-hook state (a plain field, an ancestor value) would show
 *    stale output after a move. The re-render is cheap: across a move the slots
 *    are preserved, so it does NOT re-subscribe or re-run producers — it is a Lit
 *    diff over unchanged hook state. Across a genuine remount the slots were
 *    finalized (cleared), so the same re-render re-initializes and re-subscribes
 *    them. (The perf win is not re-running producers on a move — never the cheap
 *    re-render.)
 *
 * It is installed lazily from inside the wrapped `render` (see {@link withHooks}),
 * which runs after `connectedCallback`, so `addController` fires `hostConnected`
 * synchronously on the first mount. The install is idempotent per host.
 *
 * Non-Lit hosts (no `addController`) are skipped; they may dispatch the
 * lifecycle events themselves.
 */
export function installHooksController(host: Component): void {
    if (!isReactiveHost(host) || host[HOOKS_CONTROLLER]) {
        return;
    }
    // Mark installed BEFORE addController below: on an already-connected host
    // addController fires hostConnected synchronously, and setting the flag first
    // guards against a re-entrant render re-installing a duplicate controller.
    host[HOOKS_CONTROLLER] = true;

    // First connect is the initial mount (Lit renders it anyway); only a RE-connect
    // needs a forced re-render.
    let connectedOnce = false;
    // A finalization microtask is already queued; don't queue a second.
    let finalizationQueued = false;

    const controller: ReactiveController = {
        hostConnected() {
            // Fire the connect edge synchronously on EVERY connect (mount / move /
            // remount) so edge hooks (useConnected) run their setup deterministically.
            host.dispatchEvent(new Event("connected"));
            if (connectedOnce) {
                // Re-render on EVERY reconnect — a move as well as a genuine remount.
                // The subscription slots are PRESERVED across a move (finalization is
                // gated on isConnected below), so this re-render does NOT re-subscribe
                // or re-run producers — it is a cheap Lit diff. It is required for
                // correctness: an element whose render reads mutable non-hook state
                // (a plain field, an ancestor value) would otherwise show stale output
                // after a move, since Lit does not re-render on a bare re-parent. On a
                // genuine remount the slots were finalized (cleared), so this same
                // re-render re-initializes and re-subscribes them.
                host.requestUpdate();
            }
            connectedOnce = true;
        },
        hostDisconnected() {
            // Fire the disconnect edge synchronously on EVERY disconnect (unmount /
            // move) so edge hooks tear down synchronously.
            host.dispatchEvent(new Event("disconnected"));
            // Defer slot finalization behind an isConnected re-check: a DOM move has
            // reconnected by the time the microtask runs, so its value/subscription
            // slots survive untouched; only a genuine unmount (still detached) is
            // finalized. This is what keeps a move from churning subscriptions while
            // still disposing them on a real unmount.
            if (finalizationQueued) {
                return;
            }
            finalizationQueued = true;
            queueMicrotask(() => {
                finalizationQueued = false;
                if (host.isConnected) {
                    // Moved / reconnected within the task — keep every slot alive.
                    return;
                }
                finalizeHooks(host);
            });
        },
    };
    try {
        host.addController(controller);
    } catch (error) {
        // addController failed, so no controller is registered. Clear the flag so a
        // later render can retry the install instead of being permanently skipped.
        host[HOOKS_CONTROLLER] = undefined;
        throw error;
    }
}
