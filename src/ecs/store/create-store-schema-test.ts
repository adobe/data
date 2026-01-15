// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Archetype, RequiredComponents } from "../index.js";
import { Store } from "./store.js";

const storeSchema = Store.Schema.create({
    components: {
        velocity: { type: "number" },
        particle: { type: "boolean" },
    },
    resources: {
        mousePosition: { type: "number", default: 0 },
        fooPosition: { type: "number", default: 0 },
    },
    archetypes: {
        Particle: ["particle"],
        DynamicParticle: ["particle", "velocity"],
    },
})

type TestStore = Store.FromSchema<typeof storeSchema>;
type CheckParticle = Assert<Equal<TestStore["archetypes"]["Particle"], Archetype<RequiredComponents & {
    particle: boolean;
}>>>;
type CheckDynamicParticle = Assert<Equal<TestStore["archetypes"]["DynamicParticle"], Archetype<RequiredComponents & {
    particle: boolean;
    velocity: number;
}>>>;

// Test store schema dependencies and merging
const aSchema = Store.Schema.create({
    components: {
        a: { type: "number" },
        b: { type: "string" }
    },
    resources: {
        c: { default: "string" }
    },
    archetypes: {
        one: ["a", "b"]
    }
});

const bSchema = Store.Schema.create({
    components: {
        x: { type: "number" },
        y: { type: "string" }
    },
    resources: {
        z: { default: "string" }
    },
    archetypes: {
        two: ["x", "y"]
    }
});

const cSchema = Store.Schema.create({
    components: {
        m: { type: "number" },
        n: { type: "string" }
    },
    resources: {
        c: { default: "string" }
    },
    archetypes: {
        three: ["m", "n", "m", "x"]
    },
},
    [aSchema, bSchema]
);

// Type check: verify merged schema has all components from dependencies
type MergedSchemaComponents = typeof cSchema.components;
type CheckMergedComponents = Assert<Equal<keyof MergedSchemaComponents, "a" | "b" | "x" | "y" | "m" | "n">>;

// Type check: verify merged schema has all resources from dependencies
type MergedSchemaResources = typeof cSchema.resources;
type CheckMergedResources = Assert<Equal<keyof MergedSchemaResources, "c" | "z">>;

// Type check: verify merged schema has all archetypes from dependencies
type MergedSchemaArchetypes = typeof cSchema.archetypes;
type CheckMergedArchetypes = Assert<Equal<keyof MergedSchemaArchetypes, "one" | "two" | "three">>;

// Runtime checks: verify the merged schema contains all properties
const hasAllComponents =
    "a" in cSchema.components &&
    "b" in cSchema.components &&
    "x" in cSchema.components &&
    "y" in cSchema.components &&
    "m" in cSchema.components &&
    "n" in cSchema.components;

const hasAllResources =
    "c" in cSchema.resources &&
    "z" in cSchema.resources;

const hasAllArchetypes =
    "one" in cSchema.archetypes &&
    "two" in cSchema.archetypes &&
    "three" in cSchema.archetypes;

if (!hasAllComponents) {
    throw new Error("Schema merging failed: missing components");
}

if (!hasAllResources) {
    throw new Error("Schema merging failed: missing resources");
}

if (!hasAllArchetypes) {
    throw new Error("Schema merging failed: missing archetypes");
}
