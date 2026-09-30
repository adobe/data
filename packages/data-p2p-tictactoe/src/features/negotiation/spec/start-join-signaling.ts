// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Enter the joiner signaling screen, ready to paste the host's invite code. */
export const startJoinSignaling = <T extends State>(state: T): T => ({
  ...state,
  phase: "join-signaling",
  role: "joiner",
  connection: "connecting",
  bannerText: "",
  bannerError: false,
});
