// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Enter the host signaling screen and begin waiting for an invite code. */
export const startHostSignaling = <T extends State>(state: T): T => ({
  ...state,
  phase: "host-signaling",
  role: "host",
  connection: "connecting",
  bannerText: "Generating invite code — please wait…",
  bannerError: false,
});
