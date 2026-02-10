// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../../schema/index.js";
import { Observe } from "../../observe/index.js";
import { Expand, Simplify } from "../../types/types.js";
import {
  Archetype,
  ECSArchetypes,
  ECSComponents,
  ECSResources,
} from "../ecs/ecs-types.js";
import { Entity } from "../entity.js";
import {
  Transaction,
  TransactionECS,
  TransactionObservables,
} from "../transaction-ecs/transaction-types.js";

export type ECSActionFunctions = Record<string, ActionFunction>;

export type AsyncArgsProvider<T> = () => Promise<T> | AsyncGenerator<T>;

/**
 * Represents an ECS with actions that can be applied to it.
 * Actions are functions that can be applied to the ECS to change its state.
 * They are defined in advance using the withActions method.
 * These actions are implemented using transactions which are applied to the
 * underlying TransactionECS.
 */
export interface ActionECS<
  C extends ECSComponents = ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes = {}, //  name => Entity Values Type
  R extends ECSResources = {}, //  name => Resource Value Type
  F extends ECSActionFunctions = {}, //  name => Action Function
> extends Omit<
  TransactionECS<C, A, R>,
  "createTransaction" | "withComponents" | "withArchetypes" | "withResources"
> {
  apply(action: Action<F>): void;

  readonly actions: { [K in keyof F]: ToActionFunction<F[K]> };
  readonly actionSequences: {
    [K in keyof F]: (
      ...args: Parameters<ToActionFunction<F[K]>>
    ) => ActionSequence<Parameters<ToActionFunction<F[K]>>>;
  };

  withComponents<
    S extends { [K: string]: Schema },
    T = { -readonly [K in keyof S]: Schema.ToType<S[K]> },
  >(
    components: S
  ): ActionECS<Simplify<C & T>, A, R, F>;
  withArchetypes<S extends { [K: string]: ReadonlyArray<keyof C> }>(
    archetypes: S
  ): ActionECS<
    C,
    Simplify<A & { -readonly [AN in keyof S]: Archetype<Expand<{ id: Entity } & { [PN in S[AN][number]]: C[PN] }>> }>,
    R,
    F
  >;
  withResources<S extends { readonly [K: string]: Schema & { default: any } }> (
    resources: S
  ): ActionECS<
    C,
    A,
    Simplify<R & { -readonly [K in keyof S]: Schema.ToType<S[K]> }>
  >;
  withResources<S extends { [K: string]: unknown }>(
    resources: S
  ): ActionECS<C, A, Simplify<R & S>, F>;
  withActions<S extends { [K: string]: TransactionFunction<C, A, R, F> }>(
    transactionFunctions: S
  ): ActionECS<C, A, R, Simplify<F & S>>;

  observe: ActionECSObservables<C, A, R, F>;

  /**
   * The number of transient actions that are currently in progress.
   * This is used for debugging.
   */
  getTransientActionCount: () => number;
}

export type ActionECSObservables<
  C extends ECSComponents = ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes = ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources = ECSResources, //  name => Resource Value Type
  F extends ECSActionFunctions = ECSActionFunctions, //  name => Action Function
> = TransactionObservables<C, A, R> & {
  actions: Observe<Action<F>>;
}

/**
 * Represents an action which can be applied to an ActionECS.
 */
export type Action<
  F extends ECSActionFunctions = any, //  name => Action Function
> = {
  type: "transient" | "commit" | "cancel";
  /**
   * The unique time in UTC milliseconds when the action was created.
   */
  createdTime: number;
  /**
   * The unique identifier for the user creating the action.
   */
  createdBy: string;
  /**
   * The name of the action.
   */
  name: keyof F;
  /**
   * The semantic arguments for the action.
   */
  args: Parameters<ToActionFunction<F[keyof F]>>;
}

/**
 * Gets the action type for the given ECS.
 */
export type ActionFor<ECS extends ActionECS<any, any, any, any>> =
  ECS extends ActionECS<infer C, infer A, infer R, infer F> ? Action<F> : never;

/**
 * Compares two actions to determine their correct application order.
 * Transient actions are always applied after non-transient actions.
 * Actions are then sorted by time ascending.
 * Actions are then sorted by user ascending.
 * @returns 0 if the actions are equal, -1 if a should be applied before b, 1 if b should be applied before a.
 */
export function compareActionOrder(a: Action, b: Action): number {
  if (a.createdTime !== b.createdTime) {
    return a.createdTime - b.createdTime;
  }
  return a.createdBy.localeCompare(b.createdBy, undefined, {
    sensitivity: "variant",
  });
}

export function isSameAction(a: Action, b: Action): boolean {
  return a.createdTime === b.createdTime && a.createdBy === b.createdBy;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any arg is allowed within action function
export type TransactionFunction<
  C extends ECSComponents = any, //  name => Component Value Type
  A extends ECSArchetypes = any, //  name => Entity Values Type
  R extends ECSResources = any, //  name => Resource Value Type
  F extends ECSActionFunctions = any, //  name => Action Function
> = (this: F, t: Transaction<C, A, R>, ...args: any[]) => void;

export type ToActionFunction<F> = F extends (
  t: Transaction<any, any, any>,
  ...args: infer Args
) => void
  ? ActionFunction<(Args | [AsyncArgsProvider<Args>])>
  : never;

type ActionFunction<Args extends any[] = any[]> = (...args: Args) => void;

export type ActionSequence<Args extends any[] = any[]> = {
  update: (...args: Args) => ActionSequence<Args>;
  commit: () => void;
  cancel: () => void;
};
