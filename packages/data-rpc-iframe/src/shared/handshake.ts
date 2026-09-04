// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The one-shot `window.postMessage` type the main frame uses to hand a
 * `MessagePort` to the sub frame. After the handoff both sides talk over the
 * port via `createMessagePortTransport`. Same-origin sample: `allowedOrigins`
 * is just this page's origin.
 */
export const HANDSHAKE = "data-rpc-iframe:port" as const;

export interface HandshakeMessage {
    readonly type: typeof HANDSHAKE;
}
