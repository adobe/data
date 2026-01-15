// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Data } from "../../index.js";
import { Schema } from "../../schema/index.js";
import {
  Archetype,
  ECS,
  ECSArchetypes,
  ECSComponents,
  ECSResources,
  SelectOptions,
} from "../ecs/ecs-types.js";
import { createECS } from "../ecs/ecs.js";
import {
  CoreComponents,
  Entity,
  EntityValues,
} from "../core-ecs/core-ecs-types.js";
import {
  Transaction,
  TransactionChanges,
  TransactionCommit,
  TransactionECS,
  TransactionOptions,
} from "./transaction-types.js";
import { createECSTransaction } from "./transactions.js";
import { Observe } from "../../observe/index.js";
import { equalsShallow } from "../../equals-shallow.js";

//  we want to cache this a well on each array.
function isASubsetOfB(a: readonly any[], b: readonly any[]) {
  if (a !== b) {
    const bSet = new Set(b);
    for (const value of a) {
      if (!bSet.has(value)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Creates a new TransactionECS.
 * Transactional ECS instances do not allow direct write access.
 * Instead you use transactions to make changes to the ECS.
 * They also provide observability for changes to the ECS.
 */
export function createTransactionECS<
  C extends ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources, //  name => Resource Value Type
>(ecs: ECS<C, A, R> = createECS()): TransactionECS<C, A, R> {
  const { components, archetypes, resources, ...rest } = ecs;
  const withComponents = <
    S extends { [K: string]: Schema },
    T = { [K in keyof S]: Schema.ToType<S[K]> },
  >(
    newComponents: S
  ): any => {
    ecs.withComponents(newComponents);
    return tecs as any;
  };
  const withArchetypes = <S extends { [K: string]: ReadonlyArray<keyof C> }>(
    newArchetypes: S
  ): any => {
    ecs.withArchetypes(newArchetypes);
    return tecs as any;
  };
  const withResources = <S extends { [K: string]: Data }>(
    newResources: S
  ): any => {
    ecs.withResources(newResources);
    return tecs as any;
  };
  const transactionObservers = new Set<
    (transaction: TransactionCommit<C>) => void
  >();
  const notifyTransactions = (
    transaction: TransactionCommit<C>,
    changed: TransactionChanges<C>
  ) => {
    //  notify all transaction observers.
    for (const observer of transactionObservers) {
      observer(transaction);
    }
    //  notify all observers of the entities and components that changed.
    const observers = new Set<() => void>();
    const addObservers = <K>(map: Map<K, Set<() => void>>, key: K) => {
      const set = map.get(key);
      if (set) {
        for (const observer of set) {
          observers.add(observer);
        }
      }
    };
    for (const entity of changed.entities) {
      addObservers(entityObservers, entity);
    }
    for (const name of changed.components) {
      addObservers(componentObservers, name);
    }
    for (const archetype of changed.archetypes) {
      for (const observedArchetype of archetypeObservers.keys()) {
        const isSubset = isASubsetOfB(
          observedArchetype.components,
          archetype.components
        );
        if (isSubset) {
          addObservers(archetypeObservers, observedArchetype);
        }
      }
    }
    for (const observer of observers) {
      observer();
    }
  };
  const transactions = (
    callback: (transaction: TransactionCommit<C>) => void
  ) => {
    transactionObservers.add(callback);
    return () => transactionObservers.delete(callback);
  };
  const createTransaction = (
    options?: TransactionOptions
  ): Transaction<C, A, R> => {
    return createECSTransaction(
      tecs,
      ecs,
      { undoable: true, createdTime: Date.now(), createdBy: "", ...options },
      notifyTransactions
    );
  };
  const addToMapSet = <K, T>(key: K, map: Map<K, Set<T>>, value: T) => {
    let set = map.get(key);
    if (set) {
      set.add(value);
    } else {
      map.set(key, (set = new Set([value])));
    }
    return () => {
      set!.delete(value);
    };
  };
  const entityObservers = new Map<Entity, Set<() => void>>();
  const observeEntityChanges = (entity: Entity) => (callback: () => void) => {
    return addToMapSet(entity, entityObservers, callback);
  };
  function observeEntityValues<K extends keyof A>(
    id: Entity,
    archetype: Archetype<K> & Partial<EntityValues<C>>
  ): Observe<A[K] | null | undefined>;
  function observeEntityValues(
    id: Entity
  ): Observe<EntityValues<C> | undefined>;
  function observeEntityValues<A>(
    id: Entity,
    archetype?: Archetype<A> & Partial<EntityValues<C>>
  ) {
    return (callback: (value: A | null | undefined) => void) => {
      const notify = () => {
        callback(ecs.getEntityValues(id, archetype!));
      };
      //  callback immediately to get the current value.
      notify();
      //  callback again whenever the entity changes.
      const entityChanges = observeEntityChanges(id);
      return entityChanges(notify);
    };
  }
  const componentObservers = new Map<keyof C, Set<() => void>>();
  const resourceObservables = new Map<keyof R, Observe<R[keyof R]>>();

  const observeResource = <K extends keyof R>(key: K) => {
    // Return cached observable if it exists
    const cached = resourceObservables.get(key);
    if (cached) {
      return cached as Observe<R[K]>;
    }

    // Create new observable
    const observable = (callback: (value: R[K]) => void) => {
      const notify = () => {
        callback(resources[key]);
      };
      //  callback immediately to get the current value.
      notify();
      //  callback again whenever the resource changes.
      const resourceChanges = observeComponent(key as keyof C);
      return resourceChanges(notify);
    };

    // Cache the observable
    resourceObservables.set(key, observable);
    return observable;
  };

  const observeComponent =
    <K extends keyof C>(component: K) =>
      (callback: () => void) => {
        return addToMapSet(component, componentObservers, callback);
      };
  const archetypeObservers = new Map<Archetype<unknown>, Set<() => void>>();
  const observeArchetypeChanges =
    <A extends CoreComponents>(archetype: Archetype<A>) =>
      (callback: () => void) => {
        return addToMapSet(archetype, archetypeObservers, callback);
      };

  const observeArchetypeEntities = <A extends CoreComponents>(
    archetype: Archetype<A>,
    options?: Omit<SelectOptions<C, A>, "components">
  ): Observe<Entity[]> => {
    return (callback) => {
      let lastValue: Entity[] | undefined;
      const notify = () => {
        const newValue = ecs.selectEntities(archetype, options);
        if (!lastValue || !equalsShallow(lastValue, newValue)) {
          lastValue = newValue;
          callback(newValue);
        }
      };
      notify();
      return observeArchetypeChanges(archetype)(notify);
    };
  };

  const createResourceObserver = () => {
    const handler = {
      get(target: any, prop: string | symbol) {
        if (typeof prop === 'string' && prop in resources) {
          return observeResource(prop as keyof R);
        }
        return target[prop];
      },
      apply(target: any, thisArg: any, args: any[]) {
        return target.apply(thisArg, args);
      }
    };

    return new Proxy(observeResource, handler);
  };

  const tecs = {
    ...rest,
    withComponents,
    withArchetypes,
    withResources,
    createTransaction,
    observe: {
      transactions,
      resource: createResourceObserver(),
      entityValues: observeEntityValues,
      entityChanges: observeEntityChanges,
      componentChanges: observeComponent,
      archetypeChanges: observeArchetypeChanges,
      archetypeEntities: observeArchetypeEntities,
    },
    components,
    archetypes,
    resources,
  } as const satisfies TransactionECS<C, A, R>;
  return tecs;
}
