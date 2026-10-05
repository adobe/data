// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { Cursors } from "../data/values/cursors/cursors.js";
import type { resources } from "../data/resources/index.js";

/**
 * The presence state as one immutable object: the peer cursor positions. The
 * spec the ECS presence main-service is verified against.
 */
export type State = {
  readonly cursors: Cursors;
};

// Every key names a resource (presence has no components).
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, {}>>;

export * as State from "./public.js";
