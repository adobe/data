// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, test } from "vitest";
import { createActionECS } from "./action-ecs.js";
import { ActionECS, ActionFor } from "./action-types.js";
import { EquivalentTypes, True } from "../../types/types.js";
import { Transaction } from "../transaction-ecs/transaction-types.js";
import { F32 } from "../../math/f32/index.js";
import { Tuple } from "../../schema/tuple.js";
import { Archetype } from "../../old-ecs/index.js";
import { Schema } from "../../schema/index.js";

const user = "test";
const createECSWithMassAndSize = () => {
  return createActionECS({ user })
    .withComponents({
      mass: { type: "number", minimum: 0 },
      size: { enum: ["small", "medium", "large"] },
      checkCreatedTime: { type: "integer" },
      checkCreatedBy: { type: "string" },
    } as const)
    .withArchetypes({
      physical: ["id", "mass", "size"],
      sized: ["id", "size"],
      check: ["id", "checkCreatedTime", "checkCreatedBy"],
    } as const)
    .withResources({
      gravity: { default: 9.8 },
    })
    .withActions({
      createPhysical(t, mass: number, size: "small" | "medium" | "large") {
        t.createEntity(t.ecs.archetypes.physical, { mass, size });
      },
      deletePhysical(t, entity: number) {
        t.deleteEntity(entity);
      },
      setMass(t, entity: number, mass: number) {
        t.setComponentValue(entity, "mass", mass);
      },
      setSize(t, entity: number, size: "small" | "medium" | "large") {
        t.setComponentValue(entity, "size", size);
      },
      setGravity(t, gravity: number) {
        t.resources.gravity = gravity;
      },
    })
    .withActions({
      //  higher order actions based on the previous actions
      setMassAndSize(
        this,
        t,
        entity: number,
        mass: number,
        size: "small" | "medium" | "large"
      ) {
        this.setMass(t, entity, mass);
        this.setSize(t, entity, size);
      },
      checkTransactionOptions(this, t) {
        t.createEntity(t.ecs.archetypes.check, {
          checkCreatedTime: t.options.createdTime,
          checkCreatedBy: t.options.createdBy,
        });
      }
    });
};

//  some compile time type checks.
type ECSType = ReturnType<typeof createECSWithMassAndSize>;
type C = ECSType extends ActionECS<infer C, any, any, any> ? C : never;
type A = ECSType extends ActionECS<any, infer A, any, any> ? A : never;
type R = ECSType extends ActionECS<any, any, infer R, any> ? R : never;
type Check_R = True<EquivalentTypes<R, { gravity: number }>>;
type F = ECSType extends ActionECS<any, any, any, infer F> ? F : never;
type SetMassAndSize = F["setMassAndSize"];
type Check_SetMassAndSize = True<
  SetMassAndSize extends (
    t: Transaction<C, A, R>,
    entity: number,
    mass: number,
    size: "small" | "medium" | "large"
  ) => void
  ? true
  : false
>;

let FIRST_ENTITY: number;
{
  const ecs = createECSWithMassAndSize();
  ecs.actions.createPhysical(1, "small");
  FIRST_ENTITY = ecs.selectEntities(ecs.archetypes.physical)[0];
}

describe("ActionECS", () => {
  test("can call an action to create an entity", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actions.createPhysical(1, "small");
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 1, size: "small" },
    ]);
  });
  test("calling an action includes createdTime and createdBy on options", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actions.checkTransactionOptions();
    const check = ecs.selectEntityValues(ecs.archetypes.check)[0];
    expect(check).toEqual({
      id: FIRST_ENTITY,
      checkCreatedTime: expect.any(Number),
      checkCreatedBy: user,
    });
  });
  test("calling an apply action includes createdTime and createdBy on options", () => {
    const ecs = createECSWithMassAndSize();
    //  now we check that the time is exactly what we expect
    const time = Date.now();
    ecs.apply({ type: "commit", createdTime: time, createdBy: user, name: "checkTransactionOptions", args: [] });
    const check = ecs.selectEntityValues(ecs.archetypes.check)[0];
    expect(check).toEqual({
      id: FIRST_ENTITY,
      checkCreatedTime: time,
      checkCreatedBy: user,
    });
  });
  test("can call an action twice to create two entities", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actions.createPhysical(1, "small");
    ecs.actions.createPhysical(5, "large");
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 1, size: "small" },
      { id: FIRST_ENTITY + 1, mass: 5, size: "large" },
    ]);
  });
  test("can use higher order actions", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actions.createPhysical(1, "small");
    ecs.actions.setMassAndSize(FIRST_ENTITY, 10, "medium");
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 10, size: "medium" },
    ]);
  });
  test("can call sequential actions and commit", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actionSequences.setGravity(10).update(11).update(12).commit();
    expect(ecs.resources.gravity).toBe(12);
  });
  test("can call sequential actions and cancel", () => {
    const ecs = createECSWithMassAndSize();
    ecs.actionSequences.setGravity(10).update(11).update(12).cancel();
    expect(ecs.resources.gravity).toBe(9.8);
  });
  test("can execute sequential actions and commit", async () => {
    const ecs = createECSWithMassAndSize();
    expect(ecs.getTransientActionCount()).toBe(0)
    await ecs.actions.setGravity(async function* () {
      expect(ecs.getTransientActionCount()).toBe(0)
      yield [10];
      expect(ecs.resources.gravity).toBe(10); // in flight
      expect(ecs.getTransientActionCount()).toBe(1)
      yield [11];
      expect(ecs.resources.gravity).toBe(11); // in flight
      expect(ecs.getTransientActionCount()).toBe(1)
      yield [12];
      expect(ecs.resources.gravity).toBe(12); // in flight
      expect(ecs.getTransientActionCount()).toBe(1)
    });
    expect(ecs.getTransientActionCount()).toBe(0)
    expect(ecs.resources.gravity).toBe(12);
  });
  test("can execute sequential actions and throw an error which cancels", async () => {
    const ecs = createECSWithMassAndSize();
    let cleanup = false;
    try {
      await ecs.actions.setGravity(async function* () {
        try {
          yield [10];
          yield [11];
          yield [12];
          throw new Error("test");
        }
        finally {
          cleanup = true;
        }
      });
    } catch (error) {
      expect(cleanup).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect((error as any).message).toBe("test");
    }
    expect(ecs.resources.gravity).toBe(9.8);
  });
  test("can execute promise action and commit", async () => {
    const ecs = createECSWithMassAndSize();
    await ecs.actions.setGravity(async () => {
      return [10];
    });
    expect(ecs.resources.gravity).toBe(10);
  });
  test("can use apply directly", () => {
    const ecs = createECSWithMassAndSize();
    const time = Date.now();
    ecs.apply({
      type: "commit",
      createdTime: time,
      createdBy: user,
      name: "createPhysical",
      args: [1, "small"],
    });
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 1, size: "small" },
    ]);
  });
  test("can resolve out of order apply calls", () => {
    const ecs = createECSWithMassAndSize();
    const time = Date.now();
    //  this later one is applied first
    ecs.apply({
      type: "commit",
      createdTime: time + 1,
      createdBy: user,
      name: "createPhysical",
      args: [5, "large"],
    });
    //  this earlier one is applied second
    ecs.apply({
      type: "commit",
      createdTime: time,
      createdBy: user,
      name: "createPhysical",
      args: [1, "small"],
    });
    //  the entities are sorted and reapplied by updatedTime
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 1, size: "small" },
      { id: FIRST_ENTITY + 1, mass: 5, size: "large" },
    ]);
  });
  test("with subsequent updates, created order is still retained", () => {
    //  we *could* change order later to use an updatedTime for final ordering
    //  but would still have to roll back apply calls based on last ordering
    const ecs = createECSWithMassAndSize();
    const time = Date.now();
    ecs.apply({
      type: "transient",
      createdTime: time,
      createdBy: user,
      name: "createPhysical",
      args: [1, "small"],
    });
    ecs.apply({
      type: "commit",
      createdTime: time + 1,
      createdBy: user,
      name: "createPhysical",
      args: [2, "medium"],
    });
    ecs.apply({
      type: "transient",
      createdTime: time,
      createdBy: user,
      name: "createPhysical",
      args: [5, "large"],
    });
    ecs.apply({
      type: "transient",
      createdTime: time,
      createdBy: user,
      name: "createPhysical",
      args: [10, "large"],
    });
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: FIRST_ENTITY, mass: 10, size: "large" },
      { id: FIRST_ENTITY + 1, mass: 2, size: "medium" },
    ]);
  });
  test("can observe actions", () => {
    const ecs = createECSWithMassAndSize();
    const actions: ActionFor<ECSType>[] = [];
    ecs.observe.actions((action) => actions.push(action));
    ecs.actions.createPhysical(1, "small");
    ecs.actions.createPhysical(5, "large");
    expect(actions).toEqual([
      {
        type: "commit",
        createdTime: expect.any(Number),
        createdBy: user,
        name: "createPhysical",
        args: [1, "small"],
      },
      {
        type: "commit",
        createdTime: expect.any(Number),
        createdBy: user,
        name: "createPhysical",
        args: [5, "large"],
      },
    ]);
  });
});

// sample ECS creation
const Vector3Schema = Tuple(F32.schema, 3);
const Vector4Schema = Tuple(F32.schema, 4);
type Vector3 = Schema.ToType<typeof Vector3Schema>;
type Vector4 = Schema.ToType<typeof Vector4Schema>;

//  create an action ecs
const ecs = createActionECS()
  //  define components with schemas
  .withComponents({
    position: Vector3Schema,
    velocity: Vector3Schema,
    color: Vector4Schema,
    size: { type: "number" },
    health: { type: "number" },
    player: { const: true },
  } as const)
  //  define archetypes with component names
  .withArchetypes({
    particle: ["position", "velocity", "color", "size"],
    player: ["position", "health", "player"],
  })
  //  define resources with initial values
  .withResources({
    gravity: 9.8,
  })
  //  define actions with transactional functions
  .withActions({
    createParticle(t, props: { position: Vector3, velocity: Vector3, color: Vector4, size: number }) {
      t.createEntity(t.ecs.archetypes.particle, props);
    },
    deleteParticle(t, entity: number) {
      t.deleteEntity(entity);
    },
    createPlayer(t, position: Vector3) {
      t.createEntity(t.ecs.archetypes.player, { position, health: 100, player: true });
    },
    movePlayer(t, entity: number, position: Vector3) {
      t.setComponentValue(entity, "position", position);
    },
    setGravity(t, gravity: number) {
      t.resources.gravity = gravity;
    },
  })

//  call some actions to modify the ECS
ecs.actions.createParticle({ position: [0, 0, 0], velocity: [0, 0, 0], color: [1, 0, 0, 0], size: 1 });
ecs.actions.createParticle({ position: [1, 1, 1], velocity: [1, 1, 1], color: [1, 1, 1, 1], size: 2 });
ecs.actions.createPlayer([10, 20, 0]);
//  read out the player entity
const playerEntity = ecs.selectEntities(ecs.archetypes.player)[0];
ecs.actions.movePlayer(playerEntity, [10, 20, 0]);

//  read some values from the ECS
const particles = ecs.selectEntities(ecs.archetypes.particle);

//  observe changes to the ECS
ecs.observe.archetypeEntities(ecs.archetypes.player)((playerEntities) => {
  for (const playerEntity of playerEntities) {
    const player = ecs.getEntityValues(playerEntity);
    // console.log("Player entity changed", player);
  }
});


{
  //  some type checks.
  const ecs = createActionECS()
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

  type Components = typeof ecs extends ActionECS<infer C, any, any> ? C : never;
  type CheckComponents = True<EquivalentTypes<Components, {
    id: number;
    position: string;
    size: number;
  }>>;
  type Resources = typeof ecs extends ActionECS<any, any, infer R> ? R : never;
  type CheckResources = True<EquivalentTypes<Resources, { gravity: number; time: number }>>;

  type Archetypes = typeof ecs extends ActionECS<any, infer A, any> ? A : never;
  type CheckArchetypes = True<EquivalentTypes<Archetypes, {
    position_size: Archetype<{ size: number; id: number; position: string; }>;
    position: Archetype<{ id: number; position: string; }>;
  }>>;

}