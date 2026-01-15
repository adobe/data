// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DELETE } from "../core-ecs/core-ecs.js";
import {
  Archetype,
  ECS,
  ECSArchetypes,
  ECSComponents,
  ECSResources,
  ECSWrite,
} from "../ecs/ecs-types.js";
import {
  EntityCreateValues,
  Entity,
  EntityUpdateValues,
} from "../core-ecs/core-ecs-types.js";
import {
  Transaction,
  TransactionCancel,
  TransactionChanges,
  TransactionCommit,
  TransactionComplete,
  TransactionECS,
  TransactionOptions,
  TransactionUpdateOperation,
  TransactionWriteOperation,
} from "./transaction-types.js";

export function createECSTransaction<
  C extends ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources, //  name => Resource Value Type
>(
  tecs: TransactionECS<C, A, R>,
  ecs: ECS<C, A, R>,
  options: Required<TransactionOptions>,
  transactionCommmitted: (
    value: TransactionCommit<C>,
    changes: TransactionChanges<C>
  ) => void,
  parent?: Transaction<C, A, R>
): Transaction<C, A, R> {
  const write: ECSWrite<C> = parent ?? ecs;
  const redoOperations: TransactionWriteOperation<C>[] = [];
  const undoOperationsInReverseOrder: TransactionWriteOperation<C>[] = [];

  const changed = {
    entities: new Set<Entity>(),
    components: new Set<keyof C>(),
    archetypes: new Set<Archetype>(),
  };

  function createEntity(): Entity;
  function createEntity<T>(
    archetype: Archetype<T>,
    values: EntityCreateValues<T>
  ): Entity;
  function createEntity<T>(
    archetype?: Archetype<T>,
    values?: EntityCreateValues<T>
  ): Entity {
    const entity =
      archetype && values
        ? write.createEntity(archetype, values)
        : write.createEntity();
    redoOperations.push({
      type: "create",
      values: (values ?? {}) as unknown as EntityCreateValues<C>,
    });
    undoOperationsInReverseOrder.push({ type: "delete", entity });
    changed.entities.add(entity);
    changed.archetypes.add(ecs.getEntityArchetype(entity));
    for (const key in values) {
      changed.components.add(key as keyof C);
    }
    return entity;
  }

  function updateEntity(entity: Entity, values: EntityUpdateValues<C>) {
    const oldValues = ecs.getEntityValues(entity)!;
    const replacedValues: any = {};
    for (const name in values) {
      const newValue = (values as any)[name];
      let oldValue = (oldValues as any)[name];
      if (newValue !== oldValue) {
        if (oldValue === undefined) {
          oldValue = DELETE;
        }
        replacedValues[name] = oldValue;
        changed.components.add(name as keyof C);
      }
    }

    changed.entities.add(entity);
    changed.archetypes.add(ecs.getEntityArchetype(entity));
    write.updateEntity(entity, values);
    //  archetype may have changed after update so we need to add new one.
    changed.archetypes.add(ecs.getEntityArchetype(entity));

    // maybe collapse adjacent updates to same entity.
    const lastUndoOperation: TransactionWriteOperation<C> | undefined =
      undoOperationsInReverseOrder[undoOperationsInReverseOrder.length - 1];
    if (
      lastUndoOperation?.type === "update" &&
      lastUndoOperation.entity === entity
    ) {
      const lastRedoOperation = redoOperations[
        redoOperations.length - 1
      ] as TransactionUpdateOperation<C>;
      lastRedoOperation.values = { ...lastRedoOperation.values, ...values };
      lastUndoOperation.values = {
        ...replacedValues,
        ...lastUndoOperation.values,
      };
    } else {
      redoOperations.push({ type: "update", entity, values });
      undoOperationsInReverseOrder.push({
        type: "update",
        entity,
        values: replacedValues,
      });
    }
  }

  function deleteEntity(entity: Entity) {
    changed.archetypes.add(ecs.getEntityArchetype(entity));
    changed.entities.add(entity);

    const { id: _ignore, ...oldValues } = ecs.getEntityValues(entity) as any;
    for (const key in oldValues) {
      changed.components.add(key as keyof C);
    }
    write.deleteEntity(entity);
    redoOperations.push({ type: "delete", entity });
    undoOperationsInReverseOrder.push({ type: "create", values: oldValues });
  }

  function batch(operations: TransactionWriteOperation<C>[]) {
    for (const operation of operations) {
      switch (operation.type) {
        case "create": {
          const archetype = ecs.getArchetype(
            "id",
            ...(Object.keys(operation.values) as (keyof C)[])
          );
          createEntity(archetype, operation.values);
          break;
        }
        case "update":
          updateEntity(operation.entity, operation.values);
          break;
        case "delete":
          deleteEntity(operation.entity);
          break;
      }
    }
    return transaction;
  }

  function complete(committed: true): TransactionCommit<C>;
  function complete(committed: false): TransactionCancel;
  function complete(committed: boolean): TransactionComplete<C> {
    const undoOperations = undoOperationsInReverseOrder.slice(0).reverse();

    if (!committed) {
      batch(undoOperations);
    }

    if (committed) {
      const result = { committed, options, redoOperations, undoOperations };
      if (!parent && committed) {
        transactionCommmitted(result, changed);
      }
      return result;
    } else {
      return { committed, options };
    }
  }

  const setComponentValue = <Name extends keyof C>(
    id: Entity,
    component: Name,
    value: C[Name] | undefined
  ) => {
    updateEntity(id, { [component]: value } as EntityUpdateValues<C>);
  };

  const transaction: Transaction<C, A, R> = {
    ecs: tecs,
    options,
    resources: new Proxy(ecs.resources, {
      set: (
        _target: typeof ecs.resources,
        p: string | symbol,
        value: any,
        _receiver: any
      ): boolean => {
        const archetype = ecs.getArchetype("id", p as keyof C);
        const [table] = ecs.getTables(archetype, { mode: "read", exact: true });
        const id = table.columns.id.get(0);
        updateEntity(id, { [p as keyof C]: value } as any);
        return true;
      },
    }),
    setComponentValue,
    createTransaction: () =>
      createECSTransaction(
        tecs,
        ecs,
        options,
        transactionCommmitted,
        transaction
      ),
    batch,
    commit: () => complete(true),
    cancel: () => complete(false),
    createEntity,
    updateEntity,
    deleteEntity,
  };

  return transaction;
}
