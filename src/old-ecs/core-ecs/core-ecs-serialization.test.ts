/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { describe, expect, test } from "vitest";
import { ECSJSON } from "./core-ecs-types.js";
import { createCoreECS } from "./core-ecs.js";
import { U32Schema } from "../../schema/u32.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";

const createEcsWithMassAndSize = (data?: ECSJSON, precision: 1 | 2 = 2) => {
  return createCoreECS({ data })
    .withComponents({
      mass: { type: "number", minimum: 0, precision },
      size: { enum: ["small", "medium", "large"] },
    } as const)
    .withResources({
      gravity: { default: 9.8, privacy: "strictlyNecessary" },
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
      gravity: { default: 9.8, privacy: "strictlyNecessary" },
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
        id: U32Schema,
        mass: { type: "number", minimum: +0, precision: 2 },
        size: { enum: ["small", "medium", "large"] },
        gravity: { default: 9.8, privacy: "strictlyNecessary" },
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
        id: U32Schema,
        mass: { type: "number", minimum: +0, precision: 1 },
        size: { enum: ["small", "medium", "large"] },
        gravity: { default: 9.8, privacy: "strictlyNecessary" },
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

  test("toJSON filters components based on privacy options - strictlyNecessary only", () => {
    const ecs = createCoreECS()
      .withComponents({
        userName: { type: "string", privacy: "strictlyNecessary" },
        preferences: { type: "object", privacy: "functional", default: {} },
        analytics: { type: "object", privacy: "performance", default: {} },
        ads: { type: "object", privacy: "advertising", default: {} },
        unclassified: { type: "string" }, // No privacy classification
      } as const)
      .withResources({
        appVersion: { default: "1.0.0", privacy: "strictlyNecessary" },
        userSettings: { default: {}, privacy: "functional" },
      });

    const userArchetype = ecs.getArchetype("id", "userName", "preferences", "analytics");
    ecs.createEntity(userArchetype, {
      userName: "testUser",
      preferences: { theme: "dark" },
      analytics: { pageViews: 42 },
    });

    const data = ecs.toJSON( { privacy : {
        strictlyNecessary: true
      }
    });
    expect(data.components).toEqual({
      id: U32Schema,
      userName: { type: "string", privacy: "strictlyNecessary" },
      unclassified: { type: "string" },
      appVersion: { default: "1.0.0", privacy: "strictlyNecessary" },
      ads: { type: "object", privacy: "advertising" , default: {} },
      analytics: { type: "object", privacy: "performance" , default: {} },
      preferences: { type: "object", privacy: "functional" , default: {} },
      userSettings: { default: {}, privacy: "functional"},
    });

    // Should only have table columns with strictly necessary components
    expect(data.tables).toHaveLength(4);

    const appVersionTable = data.tables.find(table => table.columns.appVersion);
    expect(appVersionTable?.columns["appVersion"]).contains("1.0.0");

    const userSettingsTable = data.tables.find(table => table.columns.userSettings);
    expect(userSettingsTable?.columns["userSettings"]).toEqual([ {} ]);

    const userTable = data.tables.find(table => table.columns.userName);
    expect(userTable?.columns["userName"]).contains("testUser");
    expect(userTable?.columns["preferences"]).toEqual([ {} ]);
    expect(userTable?.columns["analytics"]).toEqual([ {} ]);
  });

  test("toJSON filters components based on privacy options - functional included", () => {
    const ecs = createCoreECS()
      .withComponents({
        userName: { type: "string", privacy: "strictlyNecessary" },
        preferences: { type: "object", privacy: "functional" , default: { } },
        analytics: { type: "object", privacy: "performance" , default: { } },
      } as const);

    const userArchetype = ecs.getArchetype("id", "userName", "preferences", "analytics");
    ecs.createEntity(userArchetype, {
      userName: "testUser",
      preferences: { theme: "dark" },
      analytics: { pageViews: 42 },
    });

    const data = ecs.toJSON({ privacy: {
        strictlyNecessary: true,
        functional: true
      }
    });

    expect(data.components).toEqual({
      id: U32Schema,
      userName: { type: "string", privacy: "strictlyNecessary" },
      preferences: { type: "object", privacy: "functional", default: {} },
      analytics: { type: "object", privacy: "performance", default: {} },
    });

    // Should have user table with userName and preferences, but not analytics
    const userTable = data.tables.find(table => table.columns.userName);
    expect(userTable).toBeDefined();
    expect(userTable?.columns).toHaveProperty("analytics");
    expect(userTable?.columns["analytics"]).toEqual([{ }]);
  });

  test("toJSON includes all privacy levels when all options are true", () => {
    const ecs = createCoreECS()
      .withComponents({
        userName: { type: "string", privacy: "strictlyNecessary" },
        preferences: { type: "object", privacy: "functional" , default: { } },
        analytics: { type: "object", privacy: "performance" , default: { } },
        ads: { type: "object", privacy: "advertising" , default: { } },
      } as const);

    const userArchetype = ecs.getArchetype("id", "userName", "preferences", "analytics", "ads");
    ecs.createEntity(userArchetype, {
      userName: "testUser",
      preferences: { theme: "dark" },
      analytics: { pageViews: 42 },
      ads: { clicks: 100 },
    });

    const data = ecs.toJSON({ privacy: {
        strictlyNecessary: true,
        functional: true,
        performance: true,
        advertising: true,
      }
    });

    // Should include all components
    expect(data.tables).toHaveLength(2);
    expect(data.tables[1].columns["userName"]).contains("testUser");
    expect(data.tables[1].columns["preferences"]).toEqual([{ theme: "dark" }]);
    expect(data.tables[1].columns["analytics"]).toEqual([{ pageViews: 42 }]);
    expect(data.tables[1].columns["ads"]).toEqual([{ clicks: 100 }]);
  });

  test("fromJSON filters components based on privacy options", () => {
    // Create initial ECS with all privacy levels
    const ecs1 = createCoreECS()
      .withComponents({
        userName: { type: "string", privacy: "strictlyNecessary" },
        preferences: { type: "object", privacy: "functional" , default: { } },
        analytics: { type: "object", privacy: "performance" , default : { } },
      } as const);

    const userArchetype = ecs1.getArchetype("id", "userName", "preferences", "analytics");
    ecs1.createEntity(userArchetype, {
      userName: "testUser",
      preferences: { theme: "dark" },
      analytics: { pageViews: 42 },
    });

    // Save all data
    const fullData = ecs1.toJSON( { privacy: {
        strictlyNecessary: true,
        functional: true,
        performance: true,
        advertising: true,
      }
    });

    // Load ECS data
    const ecs2 = createCoreECS({ data: fullData, privacy: {
      strictlyNecessary: true,
      functional: true,
    } });

    // Read data
    const readData = ecs2.toJSON({ privacy: {
        strictlyNecessary: true,
        functional: true,
      }
    });

    expect(readData.components).toHaveProperty("userName");
    expect(readData.components).toHaveProperty("preferences");
    expect(readData.components).toHaveProperty("analytics");

    expect(readData.tables).toHaveLength(2);
    expect(readData.tables[1].columns["userName"]).contains("testUser");
    expect(readData.tables[1].columns["preferences"]).toEqual([ { theme: "dark" } ]);
    expect(readData.tables[1].columns["analytics"]).toEqual([ {  } ]);
  });

  test("privacy filtering round trip maintains data consistency", () => {
    const ecs1 = createCoreECS()
      .withComponents({
        userName: { type: "string", privacy: "strictlyNecessary" },
        preferences: { type: "object", privacy: "functional" , default: { } },
        analytics: { type: "object", privacy: "performance" , default: { } },
      } as const)
      .withResources({
        appConfig: { default: { version: "1.0" }, privacy: "strictlyNecessary" },
        userMetrics: { default: { clicks: 0 }, privacy: "performance" },
      });

    const userArchetype = ecs1.getArchetype("id", "userName", "preferences");
    const entityId = ecs1.createEntity(userArchetype, {
      userName: "testUser",
      preferences: { theme: "dark" },
    });

    // Save with all privacy levels
    const functionalData = ecs1.toJSON({ privacy: {
        strictlyNecessary: true,
        functional: true,
        performance: true,
        advertising: true,
      }
    });

    // Load back with same privacy settings
    const ecs2 = createCoreECS({ data: functionalData, privacy: {
      strictlyNecessary: true,
    } });

    // Verify data integrity
    const json = ecs2.toJSON();
    // expect(JSON.stringify(json, null, 2)).toBe("SHOW_ME_THE_VALUE2" + entityId);
    const restoredEntity = ecs2.getEntityValues(entityId);
    expect(restoredEntity).toEqual({
      id: entityId,
      userName: "testUser",
      preferences: {}
    });

    expect(ecs2.resources).not.toHaveProperty("userMetrics");
  });

  test("components without privacy classification are always included", () => {
    const ecs = createCoreECS()
      .withComponents({
        legacyField: { type: "string" }, // No privacy classification
        newPrivateField: { type: "string", privacy: "performance" , default: "defaultValue"},
      } as const);

    const archetype = ecs.getArchetype("id", "legacyField", "newPrivateField");
    ecs.createEntity(archetype, {
      legacyField: "always included",
      newPrivateField: "should be filtered",
    });

    const data = ecs.toJSON({
        privacy: { strictlyNecessary: true }
    }); // Performance not included
    expect(data.components).toHaveProperty("legacyField");
    expect(data.components).toHaveProperty("newPrivateField");

    // Verify table only has legacy field
    const entityTable = data.tables.find(table => table.columns.legacyField);
    expect(entityTable?.columns).toHaveProperty("legacyField");
    expect(entityTable?.columns).toHaveProperty("newPrivateField");
  });
});
