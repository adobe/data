// © 2026 Adobe. MIT License. See /LICENSE for details.

import { FromSchemas } from "../../../schema/from-schemas.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { StringKeyof } from "../../../types/types.js";
import { Database } from "../database.js";
import type { AsyncArgsProvider, ToTransactionFunctions, TransactionDeclarations } from "../../store/transaction-functions.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { Assert } from "../../../types/assert.js";
import { Equal } from "../../../types/equal.js";
import { ReadonlyArchetype } from "../../archetype/archetype.js";
import { RequiredComponents } from "../../required-components.js";

export type DatabaseSchema<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>
> = {
    readonly components: CS;
    readonly resources: RS;
    readonly archetypes: A;
    readonly transactions: TD;
};

export type DatabaseFromSchema<T> = T extends DatabaseSchema<infer CS, infer RS, infer A, infer TD> ? Database<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>> : never;

type CheckDatabaseFromSchema = DatabaseFromSchema<DatabaseSchema<{
    velocity: { type: "number" },
    particle: { type: "boolean" },
}, {
    mousePosition: { type: "number", default: 0 },
    fooPosition: { type: "number", default: 0 },
}, {
    Particle: ["particle"],
    DynamicParticle: ["particle", "velocity"],
}, {
    readonly createParticle: (t: any, args: { particle: boolean }) => void;
    readonly createDynamicParticle: (t: any, args: { particle: boolean, velocity: number }) => void;
}>>;
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
