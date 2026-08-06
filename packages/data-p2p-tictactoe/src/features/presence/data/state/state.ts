// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Cursors } from "../cursors/cursors.js";

/**
 * The presence state as one immutable object: the peer cursor positions. The
 * spec the ECS presence main-service is verified against.
 */
export type State = {
  readonly cursors: Cursors;
};
export * as State from "./public.js";
