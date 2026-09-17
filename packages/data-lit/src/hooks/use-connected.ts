// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { EffectCallback } from "./use-effect.js";
import { useEffect } from "./use-effect.js";
import { useRef } from "./use-ref.js";
import { Component_stack } from "./component/stack.js";

/**
 * Run `callback` on every DOM connect edge and its returned teardown on every
 * disconnect edge — the connectedness primitive for `window` / `document`
 * listeners, portals, and drag sessions that must attach and detach
 * *synchronously* as the host enters and leaves the DOM.
 *
 * The hooks controller (see `installHooksController`) dispatches the
 * `"connected"` / `"disconnected"` events synchronously on every raw edge,
 * including a DOM move, so a move tears the setup down and re-attaches it
 * deterministically.
 *
 * Setup runs exactly ONCE per connect. The teardown handle lives in a ref that
 * persists across renders, so ordinary re-renders (which re-run this hook body)
 * neither re-invoke setup nor leak — the setup/teardown pair is driven only from
 * the edge, never from the render pass. The callback is read live through a ref,
 * so callers may pass a fresh closure on every render.
 */
export function useConnected(callback: EffectCallback, dependencies?: unknown[]) {
    const component = Component_stack.active();

    // Live-read the latest callback so a fresh closure each render is honored
    // without re-registering the edge listeners.
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    // Persistent teardown handle: the cleanup returned by `callback` while
    // connected, or `undefined` while disconnected. A ref (not a per-render
    // local) so the "already connected" guard holds across renders — this is
    // what makes setup idempotent per connect instead of per render.
    const state = useRef<{ disconnect: (() => void) | void }>({ disconnect: undefined });

    useEffect(() => {
        const onConnect = () => {
            if (!state.current.disconnect) {
                state.current.disconnect = callbackRef.current();
            }
        };
        const onDisconnect = () => {
            if (state.current.disconnect) {
                state.current.disconnect();
                state.current.disconnect = undefined;
            }
        };

        // On first mount the controller dispatches "connected" during
        // `addController`, before this effect attaches its listener, so run setup
        // now if the host is already connected.
        if (component.isConnected) {
            onConnect();
        }
        component.addEventListener("connected", onConnect);
        component.addEventListener("disconnected", onDisconnect);

        return () => {
            component.removeEventListener("connected", onConnect);
            component.removeEventListener("disconnected", onDisconnect);
            onDisconnect();
        };
    }, dependencies);
}
