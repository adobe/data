// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, test } from "vitest";
import { createTransactionECS } from "./transaction-ecs.js";
import { EntityValuesFor, TransactionCommitFor, TransactionECS } from "./transaction-types.js";
import { Archetype, Entity } from "../../old-ecs/index.js";
import { EquivalentTypes, True } from "../../types/types.js";

const createECSWithMassAndSize = () => {
  return createTransactionECS()
    .withComponents({
      mass: { type: "number", minimum: 0 },
      size: { enum: ["small", "medium", "large"] },
    } as const)
    .withArchetypes({
      physical: ["id", "mass", "size"],
      sized: ["id", "size"],
    } as const)
    .withResources({
      gravity: { default: 9.8 },
    });
};

describe("TransactionECS", () => {
  test("transaction creates a single entity", () => {
    const tecs = createECSWithMassAndSize();
    const transactions: TransactionCommitFor<typeof tecs>[] = [];
    tecs.observe.transactions((commit) => {
      transactions.push(commit);
    });
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();
    expect(transactions).toEqual([
      {
        committed: true,
        options: {
          undoable: true,
          createdBy: expect.any(String),
          createdTime: expect.any(Number),
        },
        redoOperations: [
          { type: "create", values: { mass: 10, size: "medium" } },
        ],
        undoOperations: [{ type: "delete", entity: id }],
      },
    ]);
  });
  test("transaction creates multiple entities", () => {
    const tecs = createECSWithMassAndSize();
    const transactions: TransactionCommitFor<typeof tecs>[] = [];
    tecs.observe.transactions((commit) => {
      transactions.push(commit);
    });
    const transaction = tecs.createTransaction();
    const a = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = transaction.createEntity(tecs.archetypes.sized, {
      size: "small",
    });
    transaction.commit();
    expect(transactions).toEqual([
      {
        committed: true,
        options: {
          undoable: true,
          createdBy: expect.any(String),
          createdTime: expect.any(Number),
        },
        redoOperations: [
          { type: "create", values: { mass: 10, size: "medium" } },
          { type: "create", values: { size: "small" } },
        ],
        undoOperations: [
          { type: "delete", entity: b },
          { type: "delete", entity: a },
        ],
      },
    ]);
  });
  test("transaction with undoable = false", () => {
    const tecs = createECSWithMassAndSize();
    const transactions: TransactionCommitFor<typeof tecs>[] = [];
    tecs.observe.transactions((commit) => {
      transactions.push(commit);
    });
    const transaction = tecs.createTransaction({ undoable: false });
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();
    expect(transactions).toEqual([
      {
        committed: true,
        options: {
          undoable: false,
          createdBy: expect.any(String),
          createdTime: expect.any(Number),
        },
        redoOperations: [
          { type: "create", values: { mass: 10, size: "medium" } },
        ],
        undoOperations: [{ type: "delete", entity: id }],
      },
    ]);
  });
  test("transaction observes entity changes", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    let notifications = 0;
    const observer = () => {
      notifications++;
    };
    const unobserve = tecs.observe.entityChanges(id)(observer);

    {
      const transaction2 = tecs.createTransaction();
      transaction2.updateEntity(id, { size: "large" });
      transaction2.commit();
    }

    expect(notifications).toBe(1);

    unobserve();

    const transaction3 = tecs.createTransaction();
    transaction3.updateEntity(id, { size: "small" });
    transaction3.commit();

    expect(notifications).toBe(1);
  });
  test("transaction observes component changes", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    let notifications = 0;
    const observer = () => {
      notifications++;
    };
    const unobserve = tecs.observe.componentChanges("size")(observer);

    const transaction2 = tecs.createTransaction();
    transaction2.updateEntity(id, { size: "large" });
    transaction2.commit();

    expect(notifications).toBe(1);

    unobserve();

    const transaction3 = tecs.createTransaction();
    transaction3.updateEntity(id, { size: "small" });
    transaction3.commit();

    expect(notifications).toBe(1);
  });
  test("transaction observes resource changes", () => {
    const tecs = createECSWithMassAndSize();

    let notifications = 0;
    const observer = () => {
      notifications++;
    };
    const unobserve = tecs.observe.resource("gravity")(observer);

    //  should be called back with current value immediately.
    expect(notifications).toBe(1);

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 10;
      transaction.commit();
    }

    expect(notifications).toBe(2);

    unobserve();

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 8;
      transaction.commit();
    }

    expect(notifications).toBe(2);
  });
  test("transaction observes resource changes using property access", () => {
    const tecs = createECSWithMassAndSize();

    let notifications = 0;
    const observer = () => {
      notifications++;
    };
    const unobserve = tecs.observe.resource.gravity(observer);

    //  should be called back with current value immediately.
    expect(notifications).toBe(1);

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 10;
      transaction.commit();
    }

    expect(notifications).toBe(2);

    unobserve();

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 8;
      transaction.commit();
    }

    expect(notifications).toBe(2);
  });
  test("both resource access patterns work identically", () => {
    const tecs = createECSWithMassAndSize();

    let notifications1 = 0;
    let notifications2 = 0;

    const observer1 = () => { notifications1++; };
    const observer2 = () => { notifications2++; };

    const unobserve1 = tecs.observe.resource("gravity")(observer1);
    const unobserve2 = tecs.observe.resource.gravity(observer2);

    // Both should be called back with current value immediately
    expect(notifications1).toBe(1);
    expect(notifications2).toBe(1);

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 10;
      transaction.commit();
    }

    expect(notifications1).toBe(2);
    expect(notifications2).toBe(2);

    unobserve1();
    unobserve2();

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 8;
      transaction.commit();
    }

    expect(notifications1).toBe(2);
    expect(notifications2).toBe(2);
  });
  test("resource observables are cached per resource key", () => {
    const tecs = createECSWithMassAndSize();

    // Get observables using both patterns
    const funcObs1 = tecs.observe.resource("gravity");
    const funcObs2 = tecs.observe.resource("gravity");
    const propObs1 = tecs.observe.resource.gravity;
    const propObs2 = tecs.observe.resource.gravity;

    // Verify all observables are the same instance
    expect(funcObs1).toBe(funcObs2);
    expect(funcObs1).toBe(propObs1);
    expect(funcObs1).toBe(propObs2);

    // Verify they all work correctly
    let notifications1 = 0;
    let notifications2 = 0;
    let notifications3 = 0;
    let notifications4 = 0;

    const unobserve1 = funcObs1(() => { notifications1++; });
    const unobserve2 = funcObs2(() => { notifications2++; });
    const unobserve3 = propObs1(() => { notifications3++; });
    const unobserve4 = propObs2(() => { notifications4++; });

    // All should be called back with current value immediately
    expect(notifications1).toBe(1);
    expect(notifications2).toBe(1);
    expect(notifications3).toBe(1);
    expect(notifications4).toBe(1);

    {
      const transaction = tecs.createTransaction();
      transaction.resources.gravity = 10;
      transaction.commit();
    }

    // All should receive the update
    expect(notifications1).toBe(2);
    expect(notifications2).toBe(2);
    expect(notifications3).toBe(2);
    expect(notifications4).toBe(2);

    // Clean up
    unobserve1();
    unobserve2();
    unobserve3();
    unobserve4();
  });
  test("observe entity values", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    const notifications: (EntityValuesFor<typeof tecs> | undefined)[] = [];
    const unobserve = tecs.observe.entityValues(id)((value) => {
      notifications.push(value);
    });

    expect(notifications).toEqual([{ id, mass: 10, size: "medium" }]);

    {
      const transaction2 = tecs.createTransaction();
      transaction2.updateEntity(id, { size: "large" });
      transaction2.commit();
    }

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
    ]);

    {
      const transaction3 = tecs.createTransaction();
      transaction3.updateEntity(id, { size: undefined });
      transaction3.commit();
    }

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      { id, mass: 10 },
    ]);

    unobserve();

    {
      const transaction4 = tecs.createTransaction();
      transaction4.updateEntity(id, { size: "small" });
      transaction4.commit();
    }

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      { id, mass: 10 },
    ]);
  });
  test("observe entity values archetypes", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    const notifications: (
      | EntityValuesFor<typeof tecs.archetypes.physical>
      | null
      | undefined
    )[] = [];
    const unobserve = tecs.observe.entityValues(
      id,
      tecs.archetypes.physical
    )((value) => {
      notifications.push(value);
    });

    expect(notifications).toEqual([{ id, mass: 10, size: "medium" }]);

    {
      const transaction2 = tecs.createTransaction();
      transaction2.updateEntity(id, { size: "large" });
      transaction2.commit();
    }

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
    ]);

    const transaction3 = tecs.createTransaction();
    transaction3.updateEntity(id, { size: undefined });
    const t3committed = transaction3.commit();

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      null,
    ]);

    const transaction4 = tecs.createTransaction();
    transaction4.deleteEntity(id);
    const t4committed = transaction4.commit();

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      null,
      undefined,
    ]);

    tecs.createTransaction().batch(t4committed.undoOperations).commit();

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      null,
      undefined,
      null,
    ]);

    tecs.createTransaction().batch(t3committed.undoOperations).commit();

    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      null,
      undefined,
      null,
      { id, mass: 10, size: "large" },
    ]);

    unobserve();

    tecs.createTransaction().batch(t3committed.redoOperations).commit();
    //  should not be notified of this change.
    expect(notifications).toEqual([
      { id, mass: 10, size: "medium" },
      { id, mass: 10, size: "large" },
      null,
      undefined,
      null,
      { id, mass: 10, size: "large" },
    ]);
  });
  test("cancelled transaction does not commit", () => {
    const tecs = createECSWithMassAndSize();
    const transactions: TransactionCommitFor<typeof tecs>[] = [];
    tecs.observe.transactions((commit) => {
      transactions.push(commit);
    });
    const transaction = tecs.createTransaction();
    transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.resources.gravity = 20;
    expect(transaction.resources.gravity).toBe(20);
    transaction.cancel();
    expect(transactions).toEqual([]);
    expect(transaction.resources.gravity).toBe(9.8);
  });
  test("nested transactions", () => {
    const tecs = createECSWithMassAndSize();
    const transactions: TransactionCommitFor<typeof tecs>[] = [];
    tecs.observe.transactions((commit) => {
      transactions.push(commit);
    });
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    {
      const transaction2 = transaction.createTransaction();
      transaction2.updateEntity(id, { size: "small" });
      transaction2.commit();
    }
    transaction.commit();
    expect(transactions).toEqual([
      {
        committed: true,
        options: {
          undoable: true,
          createdBy: expect.any(String),
          createdTime: expect.any(Number),
        },
        redoOperations: [
          { type: "create", values: { mass: 10, size: "medium" } },
          {
            type: "update",
            entity: expect.any(Number),
            values: { size: "small" },
          },
        ],
        undoOperations: [
          {
            type: "update",
            entity: expect.any(Number),
            values: { size: "medium" },
          },
          { type: "delete", entity: expect.any(Number) },
        ],
      },
    ]);
  });
  test("transaction observes archetype changes", () => {
    const tecs = createECSWithMassAndSize()
      .withComponents({
        color: { type: "string" },
      })
      .withArchetypes({
        physicalColored: ["id", "mass", "size", "color"],
      });
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    let notifications = 0;
    const observer = () => {
      notifications++;
    };
    const unobserve = tecs.observe.archetypeChanges(tecs.archetypes.physical)(
      observer
    );

    const transaction2 = tecs.createTransaction();
    const id2 = transaction2.createEntity(tecs.archetypes.sized, {
      size: "large",
    });
    transaction2.commit();

    //  should NOT see this as our physical archetype did not change.
    expect(notifications).toBe(0);

    const transaction3 = tecs.createTransaction();
    transaction3.updateEntity(id, { size: "medium" });
    transaction3.commit();

    //  should see this as we are updating a physical.
    expect(notifications).toBe(1);

    const transaction4 = tecs.createTransaction();
    transaction4.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction4.commit();

    //  should see since we created a physical.
    expect(notifications).toBe(2);

    const transaction5 = tecs.createTransaction();
    const colored = transaction5.createEntity(tecs.archetypes.physicalColored, {
      mass: 10,
      size: "medium",
      color: "red",
    });
    transaction5.commit();

    //  should see as this is a supertype of physical.
    expect(notifications).toBe(3);

    const transaction6 = tecs.createTransaction();
    transaction6.deleteEntity(colored);
    transaction6.commit();

    //  should see as we deleted a supertype of physical.
    expect(notifications).toBe(4);

    unobserve();

    const transaction7 = tecs.createTransaction();
    transaction7.updateEntity(id, { size: "small" });
    transaction7.commit();

    expect(notifications).toBe(4);
  });
  test("observe archetype entities", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    transaction.commit();

    const observedValues: Entity[][] = [];
    const observer = (entities: Entity[]) => {
      observedValues.push(entities);
    };
    const unobserve = tecs.observe.archetypeEntities(tecs.archetypes.physical, { order: { id: false } })(
      observer
    );

    expect(observedValues).toEqual([[id]]);

    const transaction2 = tecs.createTransaction();
    const id2 = transaction2.createEntity(tecs.archetypes.sized, {
      size: "small",
    });
    transaction2.commit();

    //  should not see this as it is not a physical.
    expect(observedValues).toEqual([[id]]);

    const transaction3 = tecs.createTransaction();
    transaction3.updateEntity(id, { size: "large" });
    transaction3.commit();

    //  should not see this as the entity list did not change.
    expect(observedValues).toEqual([[id]]);

    const transaction4 = tecs.createTransaction();
    const id3 = transaction4.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "small",
    });
    transaction4.commit();

    expect(observedValues).toEqual([[id], [id3, id]]);

    unobserve();

    const transaction5 = tecs.createTransaction();
    transaction5.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "small",
    });
    transaction5.commit();

    //  should be no change since we unobserved.
    expect(observedValues).toEqual([[id], [id3, id]]);
  });
  test("have proper types on getEntityValues with archetype", () => {
    const tecs = createECSWithMassAndSize();
    const transaction = tecs.createTransaction();
    const id = transaction.createEntity(tecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });

    //  this is just type checking getEntityValues.
    const value = tecs.getEntityValues(id, tecs.archetypes.physical);
    if (!value || !value.mass || !value.size) {
      throw "Expected mass and size";
    }
  });
});


{
  //  some type checks.
  const ecs = createTransactionECS()
    .withComponents({
      position: { type: "string" },
    } as const)
    .withComponents({
      size: { type: "number" },
    } as const)
    .withResources({
      gravity: 9.8,
    })
    .withResources({
      time: 0,
    })
    .withArchetypes({
      position_size: ["id", "position", "size"],
      position: ["id", "position"],
    })

  type Components = typeof ecs extends TransactionECS<infer C, any, any> ? C : never;
  type CheckComponents = True<EquivalentTypes<Components, {
    id: number;
    position: string;
    size: number;
  }>>;
  type Resources = typeof ecs extends TransactionECS<any, any, infer R> ? R : never;
  type CheckResources = True<EquivalentTypes<Resources, { gravity: number; time: number }>>;

  type Archetypes = typeof ecs extends TransactionECS<any, infer A, any> ? A : never;
  type CheckArchetypes = True<EquivalentTypes<Archetypes, {
    position_size: Archetype<{ size: number; id: number; position: string; }>;
    position: Archetype<{ id: number; position: string; }>;
  }>>;

}