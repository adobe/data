// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Observe } from "../observe/index.js";
import type { Schema } from "../schema/index.js";
import type { Service } from "./service.js";
import type { EquivalentTypes, False, True } from "../types/types.js";

type StateDescriptor = Service.Descriptor.StateDescriptor;
type ActionDescriptor = Service.Descriptor.ActionDescriptor;

/** Map a tuple of Schemas to the (mutable) tuple of their runtime types, positionally. */
type ArgsFromSchemas<P extends readonly Schema[]> = {
  -readonly [K in keyof P]: Schema.ToType<P[K]>;
};

/**
 * `Observe<value>` for a direct state, or a factory `(...args) => Observe<value>`
 * when the state declares `parameters`.
 */
type StateToMember<S extends StateDescriptor> =
  S extends { parameters: infer P }
  ? P extends readonly Schema[]
  ? (...args: ArgsFromSchemas<P>) => Observe<Schema.ToType<S["schema"]>>
  : never
  : Observe<Schema.ToType<S["schema"]>>;

/** The resolved / yielded value of an action; `void` when no `returns` schema is given. */
type ActionValue<A extends ActionDescriptor> =
  A extends { returns: infer R } ? R extends Schema ? Schema.ToType<R> : void : void;

/** A callable whose return shape is determined by the action's `result` kind. */
type ActionToMember<A extends ActionDescriptor> =
  A extends { parameters: infer P }
  ? P extends readonly Schema[]
  ? (...args: ArgsFromSchemas<P>) =>
    A["result"] extends "promise" ? Promise<ActionValue<A>>
    : A["result"] extends "generator" ? AsyncGenerator<ActionValue<A>>
    : void
  : never
  : never;

type Simplify<T> = { [K in keyof T]: T[K] };

/**
 * Converts a statically-typed {@link Service.Descriptor} into the `Service`
 * type it describes: `states` become `Observe` values (or observe factories),
 * `actions` become callables, and `services` recurse. Used to prove — at
 * compile time — that a descriptor matches its associated service.
 */
export type DescriptorToService<D extends Service.Descriptor> = Simplify<
  & { -readonly [K in keyof D["states"]]: StateToMember<D["states"][K]> }
  & { -readonly [K in keyof D["actions"]]: ActionToMember<D["actions"][K]> }
  & {
    -readonly [K in keyof D["services"]]: D["services"][K] extends Service.Descriptor
    ? DescriptorToService<D["services"][K]>
    : never
  }
>;

// ============================================================================
// COMPILE-TIME TESTS
// ============================================================================

const userDescriptor = {
  description: "Reads and mutates users.",
  states: {
    // direct Observe property (no parameters)
    currentUser: { schema: { type: "string" }, description: "id of the current user" },
    // observe factory (parameters → callable returning Observe)
    userName: {
      schema: { type: "string" },
      parameters: [{ type: "string" }],
      description: "observe a user's name by id",
    },
  },
  actions: {
    save: {
      parameters: [{ type: "string" }],
      result: "promise",
      returns: { type: "boolean" },
      description: "persist a user; resolves to whether anything changed",
    },
    refresh: {
      parameters: [],
      result: "promise",
      description: "reload from the server; resolves to void",
    },
    poke: {
      parameters: [{ type: "string" }],
      result: "void",
      description: "fire-and-forget nudge",
    },
    watchCount: {
      parameters: [{ type: "integer" }],
      result: "generator",
      returns: { type: "integer" },
      description: "stream a running count",
    },
  },
  services: {
    audit: {
      description: "Read-only audit trail.",
      states: {
        entries: { schema: { type: "string" }, description: "latest audit entry" },
      },
      actions: {},
      services: {},
    },
  },
} as const satisfies Service.Descriptor;

type UserService = DescriptorToService<typeof userDescriptor>;

type ExpectedUserService = {
  currentUser: Observe<string>;
  userName: (id: string) => Observe<string>;
  save: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  poke: (id: string) => void;
  watchCount: (start: number) => AsyncGenerator<number>;
  audit: {
    entries: Observe<string>;
  };
};

// Positive: the transform reproduces the expected service exactly.
type _CheckUserService = True<EquivalentTypes<UserService, ExpectedUserService>>;

// Positive: each member shape in isolation.
type _CheckDirectState = True<EquivalentTypes<UserService["currentUser"], Observe<string>>>;
type _CheckObserveFactory = True<EquivalentTypes<UserService["userName"], (id: string) => Observe<string>>>;
type _CheckPromiseAction = True<EquivalentTypes<UserService["save"], (id: string) => Promise<boolean>>>;
type _CheckVoidPromiseAction = True<EquivalentTypes<UserService["refresh"], () => Promise<void>>>;
type _CheckVoidAction = True<EquivalentTypes<UserService["poke"], (id: string) => void>>;
type _CheckGeneratorAction = True<EquivalentTypes<UserService["watchCount"], (start: number) => AsyncGenerator<number>>>;
type _CheckNestedService = True<EquivalentTypes<UserService["audit"], { entries: Observe<string> }>>;

// Negative: a direct state must NOT be produced as a zero-arg observe factory.
type _CheckDirectStateNotFactory = False<EquivalentTypes<UserService["currentUser"], () => Observe<string>>>;

// Negative: an observe factory must NOT collapse to a direct Observe value.
type _CheckFactoryNotDirect = False<EquivalentTypes<UserService["userName"], Observe<string>>>;

// Negative: the promise action's resolved value must reflect its `returns` schema.
type _CheckPromiseValueTyped = False<EquivalentTypes<UserService["save"], (id: string) => Promise<string>>>;

// Negative: result kinds are distinct — a "void" action is not a promise.
type _CheckVoidNotPromise = False<EquivalentTypes<UserService["poke"], (id: string) => Promise<void>>>;

// Negative: a generator action is not a promise action.
type _CheckGeneratorNotPromise = False<EquivalentTypes<UserService["watchCount"], (start: number) => Promise<number>>>;

// Negative: argument schemas are honored — a string arg is not a number arg.
type _CheckArgTyped = False<EquivalentTypes<UserService["save"], (id: number) => Promise<boolean>>>;

// Negative: the whole service is not equivalent to one missing a member.
type _CheckMissingMember = False<EquivalentTypes<UserService, Omit<ExpectedUserService, "poke">>>;
