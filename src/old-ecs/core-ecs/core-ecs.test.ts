// © 2026 Adobe. MIT License. See /LICENSE for details.

import { assert } from "riteway/vitest";
import { describe, expect, test } from "vitest";
import { createCoreECS } from "./core-ecs.js";
import { F32 } from "../../math/f32/index.js";
import { Tuple } from "../../schema/tuple.js";
import { CoreECS, ECSJSON } from "./core-ecs-types.js";
import { EquivalentTypes, True } from "../../types/types.js";

const createCoreEcsWithMassAndSize = (data?: ECSJSON) => {
  return createCoreECS({ data })
    .withComponents({
      mass: { type: "number", minimum: 0 },
      size: { enum: ["small", "medium", "large"] },
    } as const)
    .withResources({
      gravity: 9.8,
    });
};

describe("Core ECS", () => {
  test("components", () => {
    const ecs = createCoreEcsWithMassAndSize();
    expect(ecs.components.mass).toEqual({ type: "number", minimum: 0 });
    expect(ecs.components.size).toEqual({ enum: ["small", "medium", "large"] });
  });
  test("resources", () => {
    const ecs = createCoreEcsWithMassAndSize();
    expect(ecs.resources.gravity).toEqual(9.8);
    ecs.resources.gravity = 10;
    expect(ecs.resources.gravity).toEqual(10);
  });
  test("createECS with components", () => {
    assert({
      given: "an ECS with mass component",
      should: "allow creating an entity with id and mass",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        return typeof a === "number" && a >= 0;
      })(),
      expected: true,
    });

    assert({
      given: "an ECS with mass component",
      should: "allow creating and retrieving an entity",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        const entities = ecs.selectEntities(idMassArchetype);
        return entities.length === 1 && entities[0] === a;
      })(),
      expected: true,
    });

    assert({
      given: "an ECS with mass component",
      should:
        "allow creating an entity one component at a time and retrieving an entity",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity();
        ecs.updateEntity(a, { mass: 1 });
        const entities = ecs.selectEntities(idMassArchetype);
        return entities.length === 1 && entities[0] === a;
      })(),
      expected: true,
    });

    assert({
      given: "an ECS with mass component with a mass written",
      should: "have the same value read",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        const value = ecs.getEntityValues(a);
        return value?.mass;
      })(),
      expected: 1,
    });

    assert({
      given: "an ECS with mass and size components",
      should: "allow deleting an entity",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        ecs.deleteEntity(a);
        const entities = ecs.selectEntities(idMassArchetype);
        return entities.length;
      })(),
      expected: 0,
    });

    assert({
      given: "an ECS with mass and size components",
      should: "reuse entity ids after deleting an entity",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        ecs.deleteEntity(a);
        const b = ecs.createEntity(idMassArchetype, { mass: 2 });
        return a === b;
      })(),
      expected: true,
    });

    assert({
      given: "an ECS with mass and size components",
      should:
        "creating a new entity after recycling all ids should result in a new id",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassArchetype = ecs.getArchetype("id", "mass");
        const a = ecs.createEntity(idMassArchetype, { mass: 1 });
        ecs.deleteEntity(a);
        const b = ecs.createEntity(idMassArchetype, { mass: 2 });
        const c = ecs.createEntity(idMassArchetype, { mass: 3 });
        return c > b && c > a;
      })(),
      expected: true,
    });

    assert({
      given: "an ECS with mass and size components",
      should: "return undefined for an entity that does not exist",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const value = ecs.getEntityValues(10000);
        return value;
      })(),
      expected: undefined,
    });

    assert({
      given: "updating an entity with mass, size using undefined for mass",
      should: "change size and delete mass",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
        const a = ecs.createEntity(idMassAndSizeArchetype, {
          mass: 1,
          size: "small",
        });
        ecs.updateEntity(a, { mass: undefined, size: "large" });
        const value = ecs.getEntityValues(a);
        return value?.mass === undefined && value?.size === "large";
      })(),
      expected: true,
    });

    assert({
      given:
        "creating several entities with mass, size and accessing getTables() arrays",
      should: "should allow direct access to the tables data",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
        ecs.createEntity(idMassAndSizeArchetype, { mass: 1, size: "small" });
        ecs.createEntity(idMassAndSizeArchetype, { mass: 2, size: "medium" });

        const tables = ecs.getTables(idMassAndSizeArchetype, { mode: "read" });
        const massColumn = tables[0].columns.mass.native;
        const sizeColumn = tables[0].columns.size.native;
        return [
          tables.length,
          massColumn?.[0],
          massColumn?.[1],
          sizeColumn?.[0],
          sizeColumn?.[1],
        ] as any;
      })(),
      expected: [1, 1, 2, "small", "medium"],
    });

    assert({
      given: "when creating three entities, deleting two and recreating two",
      should: "the resulting ids should be the same as the original ones",
      actual: (() => {
        const ecs = createCoreEcsWithMassAndSize();
        const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
        const a = ecs.createEntity(idMassAndSizeArchetype, {
          mass: 1,
          size: "small",
        });
        ecs.createEntity(idMassAndSizeArchetype, { mass: 2, size: "medium" });
        const c = ecs.createEntity(idMassAndSizeArchetype, {
          mass: 3,
          size: "large",
        });
        ecs.createEntity(idMassAndSizeArchetype, { mass: 4, size: "small" });
        ecs.deleteEntity(c);
        ecs.deleteEntity(a);
        const a1 = ecs.createEntity(idMassAndSizeArchetype, {
          mass: 1,
          size: "small",
        });
        const c1 = ecs.createEntity(idMassAndSizeArchetype, {
          mass: 3,
          size: "large",
        });
        const value = [a, c, a1, c1];
        return a === a1 && c === c1;
      })(),
      expected: true,
    });
  });

  test("getTables", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassArchetype = ecs.getArchetype("id", "mass");
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    ecs.createEntity(idMassArchetype, { mass: 1 });
    ecs.createEntity(idMassAndSizeArchetype, { mass: 2, size: "large" });
    const tables = ecs.getTables(ecs.getArchetype("id"), { mode: "read" });
    expect(tables.length).toEqual(3);
    const columnKeys = tables.map((table) => Object.keys(table.columns).sort());
    expect(columnKeys).toEqual([
      ["gravity", "id"],
      ["id", "mass"],
      ["id", "mass", "size"],
    ]);
  });

  test("getTables with exact", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    ecs.createEntity(idMassAndSizeArchetype, { mass: 1, size: "small" });
    ecs.createEntity(idMassAndSizeArchetype, { mass: 2, size: "large" });
    const tables = ecs.getTables(ecs.getArchetype("id", "mass"), {
      mode: "read",
      exact: true,
    });
    expect(tables.length).toEqual(1);
    const columnKeys = Object.keys(tables[0].columns).sort();
    expect(columnKeys).toEqual(["id", "mass"]);
    //  although we get the exact archetype, there are no rows within it.
    expect(tables[0].rows).toEqual(0);
  });

  test("creating, deleting and recreating", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    const a = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 1,
      size: "small",
    });
    const b = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 2,
      size: "large",
    });
    const AJSON = ecs.toJSON();
    ecs.deleteEntity(b);
    ecs.deleteEntity(a);
    const c = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 1,
      size: "small",
    });
    const d = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 2,
      size: "large",
    });
    expect(a).toEqual(c);
    const CJSON = ecs.toJSON();
    expect(AJSON).toEqual(CJSON);
    const e = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 3,
      size: "medium",
    });
    expect(e).toEqual(d + 1);
  });

  test("add 5000 rows to a table and verify the table column capacity is sufficient", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    const count = 5000;

    ecs.createEntity(idMassAndSizeArchetype, { mass: 0, size: "small" });

    const tablesBefore = ecs.getTables(idMassAndSizeArchetype, { mode: "read" })[0];
    expect(tablesBefore.columns.mass.native?.length).toBeLessThan(count);

    //  do NOT use batch, iterate to create each row directly.
    for (let i = 1; i < count; i++) {
      ecs.createEntity(idMassAndSizeArchetype, { mass: i, size: "small" });
    }
    const tablesAfter = ecs.getTables(idMassAndSizeArchetype, { mode: "read" })[0];
    expect(tablesAfter.columns.mass.native?.length).toBeGreaterThanOrEqual(count);

    //  now json serialize and deserialize
    const json = ecs.toJSON();
    const ecs2 = createCoreEcsWithMassAndSize(json);
    const tablesAfter2 = ecs2.getTables(idMassAndSizeArchetype, { mode: "read" })[0];
    expect(tablesAfter2.columns.mass.native?.length).toBeGreaterThanOrEqual(count);

    expect(tablesBefore.rows).toEqual(tablesAfter2.rows);
  });

  test("create batch", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    const count = 3;
    const table = ecs.createBatch(idMassAndSizeArchetype, count);
    for (let row = table.rows - count; row < table.rows; row++) {
      table.columns.mass.set(row, row + 1);
      table.columns.size.set(row, "small");
    }
    const entities = ecs.selectEntities(idMassAndSizeArchetype);
    expect(entities.length).toEqual(count);
    const values = entities.map((entity) => ecs.getEntityValues(entity));
    expect(values).toEqual([
      { id: expect.any(Number), mass: 1, size: "small" },
      { id: expect.any(Number), mass: 2, size: "small" },
      { id: expect.any(Number), mass: 3, size: "small" },
    ]);
  });

  test("create batch after several deletions", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    const a = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 1,
      size: "small",
    });
    const b = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 2,
      size: "large",
    });
    ecs.deleteEntity(b);
    ecs.deleteEntity(a);
    const count = 3;
    const table = ecs.createBatch(idMassAndSizeArchetype, 3);
    for (let row = table.rows - count; row < table.rows; row++) {
      table.columns.mass.set(row, row + 1);
      table.columns.size.set(row, "small");
    }
    const entities = ecs.selectEntities(idMassAndSizeArchetype);
    expect(entities.length).toEqual(3);
    const values = entities.map((entity) => ecs.getEntityValues(entity));
    expect(values).toEqual([
      { id: expect.any(Number), mass: 1, size: "small" },
      { id: expect.any(Number), mass: 2, size: "small" },
      { id: expect.any(Number), mass: 3, size: "small" },
    ]);
  });

  test("creating, deleting and recreating within the middle", () => {
    const ecs = createCoreEcsWithMassAndSize();
    const idMassAndSizeArchetype = ecs.getArchetype("id", "mass", "size");
    const a = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 1,
      size: "small",
    });
    const b = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 2,
      size: "large",
    });
    const c = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 3,
      size: "small",
    });
    const d = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 4,
      size: "small",
    });
    const e = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 5,
      size: "small",
    });
    ecs.deleteEntity(b);
    ecs.deleteEntity(d);
    const B = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 2,
      size: "large",
    });
    //  deleted id's should be reused in reverse deletion order.
    expect(B).toEqual(d);
    const D = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 4,
      size: "small",
    });
    expect(D).toEqual(b);
    //  after deleted id's used, then should continue with new ids.
    const F = ecs.createEntity(idMassAndSizeArchetype, {
      mass: 6,
      size: "small",
    });
    expect(F).toEqual(e + 1);
  });

  test("selectEntities returns all entities matching a subset of components", () => {
    const ecs = createCoreECS()
      .withComponents({
        position: { type: "number" },
        size: { type: "number" }
      } as const);

    const idPositionArchetype = ecs.getArchetype("id", "position");
    const idPositionSizeArchetype = ecs.getArchetype("id", "position", "size");

    // Create one entity with just position
    const a = ecs.createEntity(idPositionArchetype, { position: 1 });

    // Create two entities with position and size
    const b = ecs.createEntity(idPositionSizeArchetype, { position: 2, size: 1 });
    const c = ecs.createEntity(idPositionSizeArchetype, { position: 3, size: 2 });

    // Query for all entities with position
    const entities = ecs.selectEntities(idPositionArchetype);

    // Should get all three entities
    expect(entities.length).toEqual(3);
    expect(entities).toContain(a);
    expect(entities).toContain(b);
    expect(entities).toContain(c);
  });
});


{
  //  some type checks.
  const Vector3Schema = Tuple(F32.schema, 3);

  const ecs2 = createCoreECS()
    .withComponents({
      position: Vector3Schema,
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

  type Components = typeof ecs2 extends CoreECS<infer C, any> ? C : never;
  type CheckComponents = True<EquivalentTypes<Components, {
    id: number;
    position: readonly [number, number, number];
    size: number;
  }>>;
  type Resources = typeof ecs2 extends CoreECS<any, infer R> ? R : never;
  type CheckResources = True<EquivalentTypes<Resources, { gravity: number; time: number }>>;
}