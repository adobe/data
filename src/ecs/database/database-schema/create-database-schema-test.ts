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
