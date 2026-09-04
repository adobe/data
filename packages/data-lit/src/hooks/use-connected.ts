// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { EffectCallback } from "./use-effect.js";
import { useEffect } from "./use-effect.js";
import { Component_stack } from "./component/stack.js";

export function useConnected(callback: EffectCallback, dependencies?: unknown[]) {
    const component = Component_stack.active();

    let disconnect: (() => void) | void;
    function onConnect() {
        if (!disconnect) {
            disconnect = callback();
        }
    }

    function onDisconnect() {
        if (disconnect) {
            disconnect?.();
            disconnect = undefined;
        }
    }

    //  TODO
    if (component.isConnected) {
        onConnect();
    }

    useEffect(() => {
        component.addEventListener("connected", onConnect);
        component.addEventListener("disconnected", onDisconnect);

        return () => {
            component.removeEventListener("connected", onConnect);
            component.removeEventListener("disconnected", onDisconnect);

            onDisconnect();
        }

    }, dependencies);
}