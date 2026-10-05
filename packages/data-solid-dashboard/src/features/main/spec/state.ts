// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { ActivityLog } from "../data/values/activity-log/activity-log.js";
import type { resources } from "../data/resources/index.js";

// The whole dashboard as one immutable value: the specification the ECS implementation
// is verified against. Every field is a singleton; there are no entity collections.
export type State = {
  readonly count: number;
  readonly log: ActivityLog;
  readonly userName: string;
};

// Singleton keys name resources. The feature declares no components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, {}>>;

export * as State from "./public.js";
