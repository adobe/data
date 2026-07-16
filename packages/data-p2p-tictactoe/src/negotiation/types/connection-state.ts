// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Lifecycle of the peer-to-peer connection, surfaced to the UI banner. */
export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";
