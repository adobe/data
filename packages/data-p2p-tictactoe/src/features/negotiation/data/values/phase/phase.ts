// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Local-only screen the peer is currently on. Held as a session-scoped resource
 * so it never reaches the wire — only the local signaling UI reads it.
 */
export type Phase = "idle" | "host-signaling" | "join-signaling" | "game";
export * as Phase from "./public.js";
