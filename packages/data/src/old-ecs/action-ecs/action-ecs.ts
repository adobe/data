// © 2026 Adobe. MIT License. See /LICENSE for details.
import { isAsyncGenerator } from "../../internal/async-generator/is-async-generator.js";
import { Observe } from "../../observe/index.js";
import { SequentialActionResult } from "./sequential-action.js";
import {
  ECSArchetypes,
  ECSComponents,
  ECSResources,
} from "../ecs/ecs-types.js";
import { createTransactionECS } from "../transaction-ecs/transaction-ecs.js";
import {
  TransactionCommit,
  TransactionECS,
} from "../transaction-ecs/transaction-types.js";
import {
  Action,
  ActionECS,
  AsyncArgsProvider,
  ECSActionFunctions,
  ToActionFunction,
  compareActionOrder,
  isSameAction,
} from "./action-types.js";

let lastTime = 0;
function uniqueTime() {
  const currentTime = Date.now();
  lastTime = Math.max(currentTime, lastTime + 1);
  return lastTime;
}

interface AppliedActions<
  C extends ECSComponents = any,
  F extends ECSActionFunctions = any,
> {
  action: Action<F>;
  commit: TransactionCommit<C>;
}

export function createActionECS<
  C extends ECSComponents,
  A extends ECSArchetypes,
  R extends ECSResources,
  F extends ECSActionFunctions = {},
>(
  options: {
    ecs?: TransactionECS<C, A, R>,
    /**
     * A unique user identifier for the current user.
     */
    user?: string;
    /**
     * A function which returns a unique, increasing time in UTC milliseconds.
     * The function cannot return the same value twice but must increment if needed.
     */
    getUniqueTimeMs?: () => number;
    /**
     * Maximum time in milliseconds to wait for applied actions to be reordered.
     */
    maxSynchronizeDurationMs?: number;
  } = {}
): ActionECS<C, A, R, F> {
  const {
    ecs = createTransactionECS(),
    getUniqueTimeMs = uniqueTime,
    user = "",
    maxSynchronizeDurationMs = 5000,
  } = options;
  const {
    createTransaction,
    observe,
    withComponents,
    withArchetypes,
    withResources,
    ...rest
  } = ecs;
  const transactionFunctions = {} as any;
  const actions = {} as any;
  const actionSequences = {} as any;

  //  these are only stored in memory.
  const applied: AppliedActions<C, F>[] = [];

  const getInsertIndex = (action: Action<F>): number => {
    for (let i = applied.length - 1; i >= 0; i--) {
      if (isSameAction(action, applied[i].action)) {
        return i;
      }
      const sort = compareActionOrder(action, applied[i].action);
      if (sort >= 0) {
        return i + 1;
      }
    }
    return 0;
  };

  const [observeActions, notifyActions] = Observe.createEvent<Action<F>>();

  const apply = (newAction: Action<F>): void => {
    const index = getInsertIndex(newAction);
    const actionAtIndex = applied[index]?.action;
    const isSame = actionAtIndex && isSameAction(newAction, actionAtIndex);
    const mainTransaction = ecs.createTransaction({ undoable: false, createdBy: newAction.createdBy, createdTime: newAction.createdTime });
    for (let i = applied.length - 1; i >= index && i < applied.length; i--) {
      mainTransaction.batch(applied[i].commit.undoOperations);
    }
    applied.splice(index, isSame ? 1 : 0, { action: newAction, commit: undefined as any });
    for (let i = index; i < applied.length; i++) {
      const oldAction = applied[i];
      if (!oldAction) {
        console.error(`Missing applied action. Shouldn't happen. Notify codeowner!`, { index, i, newAction, applied });
        continue;
      }
      const { action: reapplyAction } = oldAction;
      if (reapplyAction.type !== "cancel") {
        const childTransaction = mainTransaction.createTransaction();
        transactionFunctions[reapplyAction.name](childTransaction, ...reapplyAction.args);
        oldAction.commit = childTransaction.commit();
      }
    }
    mainTransaction.commit();
    //  notify action observers
    notifyActions(newAction);
    pruneOldActions(newAction.createdTime);
  };

  const pruneOldActions = (currentTime: number) => {
    const canPrune = (action: Action<F>) =>
      action.type !== "transient" &&
      action.createdTime < currentTime - maxSynchronizeDurationMs;
    //  remove any actions which are no longer needed because they are older than the maxSynchronizeDurationMs
    while (applied.length > 0 && canPrune(applied[0].action)) {
      applied.shift();
    }
  };

  /**
   * Implements async execution of actions.
   * If the argProvider is an async generator, then the action is executed as a sequence.
   * If the argProvider is a promise, then the action is executed directly once awaited.
   */
  const execute = async <K extends keyof F>(action: K, argProvider: AsyncArgsProvider<Parameters<ToActionFunction<F[K]>>>): Promise<void> => {
    const argsGeneratorOrPromise = await argProvider();
    if (isAsyncGenerator(argsGeneratorOrPromise)) {
      let sequence: SequentialActionResult<any> | undefined;
      try {
        for await (const args of argsGeneratorOrPromise) {
          sequence = sequence?.update(...args) ?? actionSequences[action](...args);
        }
        sequence?.commit();
      }
      catch (e) {
        // cancel the sequence
        sequence?.cancel();
        // rethrow the error
        throw e;
      }
    } else {
      // args is still a promise so we must await it.
      const args = await argsGeneratorOrPromise;
      actions[action](...args);
    }
  }

  const getTransientActionCount = () => {
    return applied.reduce((acc, a) => acc + (a.action.type === "transient" ? 1 : 0), 0);
  }

  const actionECS = {
    ...rest,
    apply,
    getTransientActionCount,
    actions,
    actionSequences,
    withComponents: (newComponents: any) => {
      withComponents(newComponents);
      return actionECS as any;
    },
    withArchetypes: (newArchetypes: any) => {
      withArchetypes(newArchetypes);
      return actionECS as any;
    },
    withResources: (newResources: any) => {
      withResources(newResources);
      return actionECS as any;
    },
    withActions: <S>(newTransactionFunctions: S): any => {
      for (const name in newTransactionFunctions) {
        const action = newTransactionFunctions[name];
        if (transactionFunctions[name]) {
          throw new Error(`Action already exists: ${name}`);
        }
        transactionFunctions[name] = action;
        actions[name] = (...args: any) => {
          const firstArg = args[0];
          // handle new async execution pattern.
          if (typeof firstArg === "function") {
            return execute(name, firstArg as any);
          }

          const createdTime = getUniqueTimeMs();
          apply({ type: "commit", createdTime, createdBy: user, name, args });
        };
        actionSequences[name] = (...originalArgs: any) => {
          const createdTime = getUniqueTimeMs();
          if (typeof originalArgs[0] === "function") {
            throw new Error("Cannot use a function as argument to a sequence. For async execution you want to use ecs.actions instead of ecs.actionSequences.");
          }
          let args = originalArgs;
          const sequence = {
            update: (...updateArgs: any) => {
              args = updateArgs;
              apply({
                type: "transient",
                createdTime,
                createdBy: user,
                name,
                args,
              });
              return sequence;
            },
            commit: () => {
              apply({
                type: "commit",
                createdTime,
                createdBy: user,
                name,
                args,
              });
            },
            cancel: () => {
              apply({
                type: "cancel",
                createdTime,
                createdBy: user,
                name,
                args,
              });
            },
          };
          sequence.update(...originalArgs);
          return sequence;
        };
      }
      return actionECS as any;
    },
    observe: {
      ...observe,
      actions: observeActions,
    },
  };

  return actionECS;
}
