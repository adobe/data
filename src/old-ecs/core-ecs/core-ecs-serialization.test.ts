// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, test } from "vitest";
import { ECSJSON } from "./core-ecs-types.js";
import { createCoreECS } from "./core-ecs.js";
import { U32 } from "../../math/u32/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";

const createEcsWithMassAndSize = (data?: ECSJSON, precision: 1 | 2 = 2) => {
  return createCoreECS({ data })
    .withComponents({
      mass: { type: "number", minimum: 0, precision },
      size: { enum: ["small", "medium", "large"] },
    } as const)
    .withResources({
      gravity: { default: 9.8 },
    });
};

type CheckGravityResourceType = Assert<Equal<ReturnType<typeof createEcsWithMassAndSize>["resources"]["gravity"], number>>;

const createEcsWithMassAndSizeAndShape = (data?: ECSJSON) => {
  return createCoreECS({ data })
    .withComponents({
      mass: { type: "number", minimum: 0, precision: 2 },
      shape: { enum: ["circle", "square", "triangle"] },
      size: { enum: ["small", "medium", "large"] },
    } as const)
    .withResources({
      gravity: { default: 9.8 },
    });
};

describe("ecs-functions", () => {
  test("toJSON with base64 encoded binary data, mass is float64array", () => {
    const ecs = createEcsWithMassAndSize();
    const physical = ecs.getArchetype("id", "mass", "size");
    for (let i = 1; i < 10; i++) {
      ecs.createEntity(physical, {
        mass: 3123123123121.232 / i,
        size: "medium",
      });
    }
    const data = ecs.toJSON();
    expect(data).toEqual({
      ecs: true,
      version: 4,
      components: {
        id: U32.schema,
        mass: { type: "number", minimum: +0, precision: 2 },
        size: { enum: ["small", "medium", "large"] },
        gravity: { default: 9.8 },
      },
      entities: [1, +0, 2, +0, 2, 1, 2, 2, 2, 3, 2, 4, 2, 5, 2, 6, 2, 7, 2, 8],
      tables: [
        { rows: +0, columns: { id: [] } },
        { rows: 1, columns: { gravity: [9.8], id: [+0] } },
        {
          rows: 9,
          columns: {
            //  id is not base 64 encoded because the json is shorter.
            id: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            //  mass is base 64 encoded because the encoded form is shorter.
            //  This one is longer than the
            mass: "24mdJ0W5hkLbiZ0nRbl2QiQN0jRcTG5C24mdJ0W5ZkLiB37s0C1iQiQN0jRcTF5CQwu0CE/4WULbiZ0nRblWQm2zNiPoMlRC",
            //  size could be compressed efficiently by any general compression algorithm.
            //  we don't expect large data sets to use strings for components so we don't compress it.
            size: [
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
            ],
          },
        },
      ],
    });
  });
  test("toJSON with base64 encoded binary data, mass is float32array", () => {
    const precision = 1;
    const ecs = createEcsWithMassAndSize(undefined, precision);
    const physical = ecs.getArchetype("id", "mass", "size");
    for (let i = 1; i < 10; i++) {
      ecs.createEntity(physical, {
        mass: 3123123123121.232 / i,
        size: "medium",
      });
    }
    const data = ecs.toJSON();
    expect(data).toEqual({
      ecs: true,
      version: 4,
      components: {
        id: U32.schema,
        mass: { type: "number", minimum: +0, precision: 1 },
        size: { enum: ["small", "medium", "large"] },
        gravity: { default: 9.8 },
      },
      entities: [1, +0, 2, +0, 2, 1, 2, 2, 2, 3, 2, 4, 2, 5, 2, 6, 2, 7, 2, 8],
      tables: [
        { rows: +0, columns: { id: [] } },
        { rows: 1, columns: { gravity: [9.8], id: [+0] } },
        {
          rows: 9,
          columns: {
            //  id is not base 64 encoded because the json is shorter.
            id: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            //  mass is base 64 encoded because the encoded form is shorter.
            mass: "Kco1VCnKtVPiYnJTKco1U4duEVPiYvJSeMLPUinKtVJBl6FS",
            //  size could be compressed efficiently by any general compression algorithm.
            //  we don't expect large data sets to use strings for components so we don't compress it.
            size: [
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
              "medium",
            ],
          },
        },
      ],
    });
  });
  test("toJSON and fromJSON round trip", () => {
    const ecs = createEcsWithMassAndSize();
    const physical = ecs.getArchetype("id", "mass", "size");
    for (let i = 1; i < 10; i++) {
      ecs.createEntity(physical, {
        mass: 3123123123121.232 / i,
        size: "medium",
      });
    }
    const data = ecs.toJSON();
    const ecs2 = createEcsWithMassAndSize(data);
    const data2 = ecs2.toJSON();
    expect(data2).toEqual(data);
  });
  test("toJSON and fromJSON round trip with new components", () => {
    const ecs = createEcsWithMassAndSize();
    const physical = ecs.getArchetype("id", "mass", "size");
    for (let i = 1; i < 10; i++) {
      ecs.createEntity(physical, {
        mass: 3123123123121.232 / i,
        size: "medium",
      });
    }
    const data = ecs.toJSON();
    const ecs2 = createEcsWithMassAndSizeAndShape(data);
    const physicalAndShaped = ecs2.getArchetype("id", "mass", "size", "shape");
    ecs2.createEntity(physicalAndShaped, {
      mass: 98,
      size: "medium",
      shape: "circle",
    });

    const data2 = ecs2.toJSON();
    const ecs3 = createEcsWithMassAndSizeAndShape(data2);

    const data3 = ecs3.toJSON();
    expect(data3).toEqual(data2);
  });
  test("verify entity data consistency when changing archetypes", () => {
    const ecs = createEcsWithMassAndSizeAndShape();
    const initialArchetype = ecs.getArchetype("id", "mass");
    const targetArchetype = ecs.getArchetype("id", "mass", "shape");

    // Create 100 entities with just mass
    const entities = [];
    for (let i = 0; i < 100; i++) {
      const entity = ecs.createEntity(initialArchetype, {
        mass: i + 1.5
      });
      entities.push(entity);
    }

    // Update each entity one by one, adding the shape component
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const expectedMass = i + 1.5;

      // Update entity to add shape component
      ecs.updateEntity(entity, {
        mass: expectedMass,
        shape: "circle"
      });

      // Verify the entity data immediately after update
      const entityData = ecs.getEntityValues(entity);
      if (!entityData) {
        throw new Error(`Entity ${entity} not found after update`);
      }

      if (entityData.mass !== expectedMass) {
        throw new Error(`Entity ${entity} has incorrect mass. Expected ${expectedMass}, got ${entityData.mass}`);
      }
      if (entityData.shape !== "circle") {
        throw new Error(`Entity ${entity} has incorrect shape. Expected "circle", got ${entityData.shape}`);
      }

      // Also verify all previously updated entities still have correct data
      for (let j = 0; j <= i; j++) {
        const prevEntity = entities[j];
        const prevData = ecs.getEntityValues(prevEntity);
        if (!prevData) {
          throw new Error(`Previously updated entity ${prevEntity} not found`);
        }
        const prevExpectedMass = j + 1.5;

        if (prevData.mass !== prevExpectedMass) {
          throw new Error(`Previously updated entity ${prevEntity} has incorrect mass. Expected ${prevExpectedMass}, got ${prevData.mass}`);
        }
        if (prevData.shape !== "circle") {
          throw new Error(`Previously updated entity ${prevEntity} has incorrect shape. Expected "circle", got ${prevData.shape}`);
        }
      }
    }
  });






});
