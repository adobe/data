// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../../types/assert.js";
import { Equal } from "../../../types/equal.js";
import { ReadonlyArchetype } from "../../archetype/archetype.js";
import { RequiredComponents } from "../../required-components.js";
import type { AsyncArgsProvider } from "../../store/transaction-functions.js";
import { DatabaseFromSchema } from "./database-schema.js";
import { createDatabaseSchema } from "./create-database-schema.js";

const databaseSchema = createDatabaseSchema(
    {
        velocity: { type: "number" },
        particle: { type: "boolean" },
    },
    {
        mousePosition: { type: "number", default: 0 },
        fooPosition: { type: "number", default: 0 },
    },
    {
        Particle: ["particle"],
        DynamicParticle: ["particle", "velocity"],
    },
    {
        createParticle(t, args: { particle: boolean }) {
            // @ts-expect-error - Testing that NonParticle archetype doesn't exist
            t.archetypes.NonParticle;
            t.archetypes.Particle.insert({ particle: args.particle });
        },
        createDynamicParticle(t, args: { particle: boolean, velocity: number }) {
            t.archetypes.DynamicParticle.insert({ particle: args.particle, velocity: args.velocity });
        }
    }
)

type CheckDatabaseFromSchema = DatabaseFromSchema<typeof databaseSchema>;
declare const testDatabase: CheckDatabaseFromSchema;
type CheckDynamicParticle = Assert<Equal<typeof testDatabase.archetypes.DynamicParticle, ReadonlyArchetype<RequiredComponents & {
    particle: boolean;
    velocity: number;
}>>>;
type CheckParticle = Assert<Equal<typeof testDatabase.archetypes.Particle, ReadonlyArchetype<RequiredComponents & {
    particle: boolean;
}>>>;
type CheckCreateParticle = Assert<Equal<typeof testDatabase.transactions.createParticle, (arg: {
    particle: boolean;
} | AsyncArgsProvider<{
    particle: boolean;
}>) => void>>;
type CheckCreateDynamicParticle = Assert<Equal<typeof testDatabase.transactions.createDynamicParticle, (arg: {
    particle: boolean;
    velocity: number;
} | AsyncArgsProvider<{
    particle: boolean;
    velocity: number;
}>) => void>>;
