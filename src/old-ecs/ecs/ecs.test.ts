// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, test } from "vitest";
import { createECS } from "./ecs.js";
import { True } from "../../schema/index.js";
import { Archetype, ECS } from "./ecs-types.js";
import { EquivalentTypes, True as TrueType } from "../../types/types.js";

const createEcsWithMassAndSize = () => {
  return createECS()
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

describe("ECS", () => {
  test("archetypes", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    expect(ecs.selectEntities(ecs.archetypes.physical)).toEqual([a, b]);
  });
  test("getEntityValues", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.sized, { size: "large" });
    expect(ecs.getEntityValues(a, ecs.archetypes.physical)).toEqual({
      id: a,
      mass: 10,
      size: "medium",
    });
    expect(ecs.getEntityValues(b, ecs.archetypes.physical)).toEqual(null);
    expect(ecs.getEntityValues(b)).toEqual({ id: b, size: "large" });
    expect(ecs.getEntityValues(-1, ecs.archetypes.physical)).toEqual(undefined);
  });
  test("selectEntityValues: basic", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.sized, { size: "large" });
    expect(ecs.selectEntityValues(ecs.archetypes.physical)).toEqual([
      { id: a, mass: 10, size: "medium" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.sized).sort()).toEqual([
      { id: a, mass: 10, size: "medium" },
      { id: b, size: "large" },
    ]);
  });
  test("selectEntityValues: with components", () => {
    const ecs = createEcsWithMassAndSize()
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });
    const d = ecs.createEntity(ecs.archetypes.physical, {
      mass: 40,
      size: "small",
    });
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["size"] })).toEqual([
      { size: "medium" },
      { size: "large" },
      { size: "large" },
      { size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id", "size"] })).toEqual([
      { id: a, size: "medium" },
      { id: b, size: "large" },
      { id: c, size: "large" },
      { id: d, size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id", "size"], order: { id: true } })).toEqual([
      { id: a, size: "medium" },
      { id: b, size: "large" },
      { id: c, size: "large" },
      { id: d, size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id", "size"], order: { id: false } })).toEqual([
      { id: d, size: "small" },
      { id: c, size: "large" },
      { id: b, size: "large" },
      { id: a, size: "medium" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id", "size"], order: { size: true } })).toEqual([
      { id: b, size: "large" },
      { id: c, size: "large" },
      { id: a, size: "medium" },
      { id: d, size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id", "size"], order: { size: true, id: false } })).toEqual([
      { id: c, size: "large" },
      { id: b, size: "large" },
      { id: a, size: "medium" },
      { id: d, size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["id"], order: { size: true, id: false } })).toEqual([
      { id: c },
      { id: b },
      { id: a },
      { id: d },
    ]);
    expect(ecs.selectEntities(ecs.archetypes.physical, { order: { size: true, id: false } })).toEqual([
      c, b, a, d
    ]);

  });

  test("selectEntityValues: without components", () => {
    const ecs = createEcsWithMassAndSize()
      .withComponents({
        deleted: True.schema,
      })
      .withArchetypes({
        physical_deleted: ["id", "mass", "size", "deleted"],
      });

    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical_deleted, {
      mass: 20,
      size: "large",
      deleted: true
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });
    const d = ecs.createEntity(ecs.archetypes.physical_deleted, {
      mass: 40,
      size: "small",
      deleted: true
    });
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["size"] })).toEqual([
      { size: "medium" },
      { size: "large" },
      { size: "large" },
      { size: "small" },
    ]);
    expect(ecs.selectEntityValues(ecs.archetypes.physical, { components: ["size"], without: ["deleted"] })).toEqual([
      { size: "medium" },
      { size: "large" },
    ]);
    expect(ecs.selectEntities(ecs.archetypes.physical, { order: { size: true, id: false } })).toEqual([
      c, b, a, d
    ]);
    expect(ecs.selectEntities(ecs.archetypes.physical, { order: { size: true, id: false }, without: ["deleted"] })).toEqual([
      c, a
    ]);
  });
  test("selectEntityValues: where", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        where: { size: "medium" },
      })
    ).toEqual([{ id: a, mass: 10, size: "medium" }]);
  });
  test("selectEntityValues: where with components", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });

    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        components: ["id", "mass"],
        where: { size: "large" }
      })
    ).toEqual([
      { id: b, mass: 20 },
      { id: c, mass: 30 }
    ]);
  });

  test("selectEntityValues: where with order", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });

    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        where: { size: "large" },
        order: { mass: false }
      })
    ).toEqual([
      { id: c, mass: 30, size: "large" },
      { id: b, mass: 20, size: "large" }
    ]);
  });

  test("selectEntityValues: where with components and order", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });

    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        components: ["id", "mass"],
        where: { size: "large" },
        order: { mass: false }
      })
    ).toEqual([
      { id: c, mass: 30 },
      { id: b, mass: 20 }
    ]);
  });

  test("selectEntityValues: where with without option", () => {
    const ecs = createEcsWithMassAndSize()
      .withComponents({
        deleted: True.schema,
      })
      .withArchetypes({
        physical_deleted: ["id", "mass", "size", "deleted"],
      });

    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical_deleted, {
      mass: 20,
      size: "large",
      deleted: true
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });
    const d = ecs.createEntity(ecs.archetypes.physical_deleted, {
      mass: 40,
      size: "small",
      deleted: true
    });

    // where + without
    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        where: { size: "large" },
        without: ["deleted"]
      })
    ).toEqual([
      { id: c, mass: 30, size: "large" }
    ]);

    // where + without + components
    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        components: ["id", "size"],
        where: {
          mass: {
            ">": 15
          }
        },
        without: ["deleted"]
      })
    ).toEqual([
      { id: c, size: "large" }
    ]);

    // where + without + order
    expect(
      ecs.selectEntities(ecs.archetypes.physical, {
        where: {
          mass: {
            ">": 15
          }
        },
        without: ["deleted"],
        order: { size: true }
      })
    ).toEqual([c]);
  });

  test("selectEntityValues: edge cases for where function", () => {
    const ecs = createEcsWithMassAndSize();
    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });

    // Empty result with where
    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        where: { size: "small" }
      })
    ).toEqual([]);

    // Where with complex condition
    expect(
      ecs.selectEntityValues(ecs.archetypes.physical, {
        where: {
          mass: {
            ">": 5,
            "<": 15
          },
          size: {
            "!=": "small"
          }
        }
      })
    ).toEqual([
      { id: a, mass: 10, size: "medium" }
    ]);
  });
  test("selectEntities: where", () => {
    const ecs = createEcsWithMassAndSize();

    const a = ecs.createEntity(ecs.archetypes.physical, {
      mass: 10,
      size: "medium",
    });
    const b = ecs.createEntity(ecs.archetypes.physical, {
      mass: 20,
      size: "large",
    });
    const c = ecs.createEntity(ecs.archetypes.physical, {
      mass: 30,
      size: "large",
    });
    expect(
      ecs.selectEntities(ecs.archetypes.physical, {
        where: { size: "large" },
      })
    ).toEqual([b, c]);
    expect(
      ecs.selectEntities(ecs.archetypes.physical, {
        where: { size: "medium" },
      })
    ).toEqual([a]);
  });
});


{
  //  some type checks.
  const ecs = createECS()
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

  const entityValues = ecs.selectEntityValues(ecs.archetypes.position);

  type Components = typeof ecs extends ECS<infer C, any, any> ? C : never;
  type CheckComponents = TrueType<EquivalentTypes<Components, {
    id: number;
    position: string;
    size: number;
  }>>;
  type Resources = typeof ecs extends ECS<any, any, infer R> ? R : never;
  type CheckResources = TrueType<EquivalentTypes<Resources, { gravity: number; time: number }>>;

  type Archetypes = typeof ecs extends ECS<any, infer A, any> ? A : never;
  type CheckArchetypes = TrueType<EquivalentTypes<Archetypes, {
    position_size: Archetype<{ size: number; id: number; position: string; }>;
    position: Archetype<{ id: number; position: string; }>;
  }>>;

}