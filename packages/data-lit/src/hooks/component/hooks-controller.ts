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
    return typeof (host as Partial<ReactiveControllerHost>).addController === "function";
}

/**
 * Dispose every effect-style hook slot and reset the hook cursor so the next
 * render re-initializes hooks from scratch. Only slots that expose a
 * `dispose` function (effects, subscriptions) are torn down; value slots
 * (state, memo, ref) are simply dropped.
 */
function disposeHooks(host: Component): void {
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
 * Give a hook host a real disconnect edge.
 *
 * The hook model stores every effect's cleanup in `host.hooks[i].dispose`,
 * but {@link useEffect} only invokes it when dependencies change — never when
 * the element leaves the DOM. Left alone, every `useObservable` /
 * `useObservableValues` / `useEffect` subscription leaks on unmount and keeps
 * firing `requestUpdate` on a detached element. `useConnected` is likewise
 * inert because nothing dispatches the `"connected"` / `"disconnected"`
 * events it listens for.
 *
 * This installs a single Lit {@link ReactiveController} — the one hook-friendly
 * path to a genuine `hostDisconnected` — that:
 *  - on connect, dispatches `"connected"`, and on every *re*-connect forces a
 *    re-render so the (previously torn-down) hooks re-initialize and
 *    re-subscribe;
 *  - on disconnect, dispatches `"disconnected"` then disposes and clears all
 *    hook slots (full unmount semantics).
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
    host[HOOKS_CONTROLLER] = true;

    let connectedOnce = false;
    const controller: ReactiveController = {
        hostConnected() {
            host.dispatchEvent(new Event("connected"));
            if (connectedOnce) {
                // Reconnect: the previous disconnect disposed and cleared every
                // hook slot, so re-render to re-run hooks and re-subscribe.
                host.requestUpdate();
            }
            connectedOnce = true;
        },
        hostDisconnected() {
            host.dispatchEvent(new Event("disconnected"));
            disposeHooks(host);
        },
    };
    host.addController(controller);
}
